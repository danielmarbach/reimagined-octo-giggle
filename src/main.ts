import * as core from '@actions/core'
import { InlineProgramArgs, LocalWorkspace } from "@pulumi/pulumi/automation";
import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as containerinstance from "@pulumi/azure-native/containerinstance";
import * as pulumi from "@pulumi/pulumi";

async function run(): Promise<void> {
  try {
    const pulumiProgram = async () => {

      const imageName = "gvenzl/oracle-xe:21-slim";

      // for now hardcoded things
      let resourceGroup = new resources.ResourceGroup("tf-ktlo-1018-oracle-actions-RG");

      let storageAccount = new storage.StorageAccount("storageAccount", {
        accountName: "psworacle1",
        allowBlobPublicAccess: false,
        allowSharedKeyAccess: true,
        kind: storage.Kind.StorageV2,
        resourceGroupName: resourceGroup.name,
        sku: {
          name: storage.SkuName.Standard_LRS,
        },
      });

      let storageAccountKeys = storage.listStorageAccountKeysOutput({
        resourceGroupName: resourceGroup.name,
        accountName: storageAccount.name
      });
    
      let fileShare = new storage.FileShare("fileShare", {
        accountName: storageAccount.name,
        resourceGroupName: resourceGroup.name,
        shareName: "psworacle1",
      });

      // apparently you can't upload to file shares yet
      // https://github.com/pulumi/pulumi-azure-native/issues/1664
      // so I would need to use the SDK directly by leveraging the corresponding clients for uploading files
      // https://github.com/pulumi/examples/blob/master/azure-ts-call-azure-sdk/index.ts
      
      let containerGroup = new containerinstance.ContainerGroup("containerGroup", {
        resourceGroupName: resourceGroup.name,
        osType: "Linux",
        containers: [{
          name: "psw-oracle-1",
          image: imageName,
          environmentVariables: [
            {
              name: "ORACLE_PASSWORD",
              secureValue: "Welcome1"
            }
          ],
          ports: [{ port: 1527 }],
          resources: {
            requests: {
              cpu: 4.0,
              memoryInGB: 8,
            },
          },
          volumeMounts: [
            {
              mountPath: "/mnt/scripts",
              name: "scripts",
              readOnly: false,
            },
          ],

        }],
        ipAddress: {
          ports: [{
            port: 80,
            protocol: "Tcp",
          }],
          type: "Public",
        },
        restartPolicy: "always",
        volumes: [
          {
            azureFile: {
              shareName: fileShare.name,
              storageAccountKey: storageAccountKeys.keys[0].value,
              storageAccountName: storageAccount.name,
            },
            name: "scripts",
          },
        ],
      });

      return {
      };
    };

    // Create our stack 
    const args: InlineProgramArgs = {
      stackName: "dev",
      projectName: "inlineNode",
      program: pulumiProgram
    };

    // create (or select if one already exists) a stack that uses our inline program
    const stack = await LocalWorkspace.createOrSelectStack(args);

    console.info("successfully initialized stack");
    console.info("installing plugins...");
    await stack.workspace.installPlugin("azure-native", "v1.65.0");
    console.info("plugins installed");
    console.info("setting up config");
    await stack.setConfig("azure-native:location", { value: "West Europe" });
    console.info("config set");
    console.info("refreshing stack...");
    await stack.refresh({ onOutput: console.info });
    console.info("refresh complete");

    console.info("updating stack...");
    const upRes = await stack.up({ onOutput: console.info });
    console.log(`update summary: \n${JSON.stringify(upRes.summary.resourceChanges, null, 4)}`);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
