import * as core from '@actions/core'
import { InlineProgramArgs, LocalWorkspace } from '@pulumi/pulumi/automation'
import * as storage from '@pulumi/azure-native/storage'
import * as classicstorage from '@pulumi/azure/storage'
import * as containerinstance from '@pulumi/azure-native/containerinstance'

async function run(): Promise<void> {
  try {
    const pulumiProgram = async () => {
      const imageName = 'gvenzl/oracle-xe:21-slim'

      // for now hardcoded things
      const resourceGroup = 'tf-ktlo-1018-oracle-actions-RG';

      const storageAccount = new storage.StorageAccount('storageAccount', {
        accountName: 'psworacle1',
        allowBlobPublicAccess: false,
        allowSharedKeyAccess: true,
        kind: storage.Kind.StorageV2,
        resourceGroupName: resourceGroup,
        sku: {
          name: storage.SkuName.Standard_LRS
        }
      })

      const storageAccountKeys = storage.listStorageAccountKeysOutput({
        resourceGroupName: resourceGroup,
        accountName: storageAccount.name
      })

      const fileShare = new storage.FileShare('fileShare', {
        accountName: storageAccount.name,
        resourceGroupName: resourceGroup,
        shareName: 'psworacle1'
      })

      // apparently you can't upload to file shares yet
      // https://github.com/pulumi/pulumi-azure-native/issues/1664
      // so I would need to use the SDK directly by leveraging the corresponding clients for uploading files
      // https://github.com/pulumi/examples/blob/master/azure-ts-call-azure-sdk/index.ts
      // or use the classic stuff

      // const exampleAccount = new classicstorage.Account("exampleAccount", {
      //   resourceGroupName: resourceGroup,
      //   accountTier: "Standard",
      //   accountReplicationType: "LRS",
      // });
      // const exampleShare = new classicstorage.Share("exampleShare", {
      //   storageAccountName: exampleAccount.name,
      //   quota: 50,
      // });
      // const exampleShareFile = new classicstorage.ShareFile("exampleShareFile", {
      //   storageShareId: exampleShare.id,
      //   source: "/home/danielmarbach/Projects/reimagined-octo-giggle/LICENSE",
      // });


      // const exampleShareFile = new classicstorage.ShareFile("licenseFileShare", {
      //   storageShareId: fileShare.id,
      //   source: "/home/danielmarbach/Projects/reimagined-octo-giggle/LICENSE",
      // });

      const containerGroup = new containerinstance.ContainerGroup(
        'containerGroup',
        {
          resourceGroupName: resourceGroup,
          osType: 'Linux',
          containers: [
            {
              name: 'psw-oracle-1',
              image: imageName,
              environmentVariables: [
                {
                  name: 'ORACLE_PASSWORD',
                  secureValue: 'Welcome1'
                }
              ],
              ports: [{ port: 1521 }],
              resources: {
                requests: {
                  cpu: 4.0,
                  memoryInGB: 8
                }
              },
              volumeMounts: [
                {
                  mountPath: '/mnt/scripts',
                  name: 'scripts',
                  readOnly: false
                }
              ]
            }
          ],
          ipAddress: {
            ports: [
              {
                port: 1521,
                protocol: 'Tcp'
              }
            ],
            type: 'Public'
          },
          restartPolicy: 'always',
          volumes: [
            {
              azureFile: {
                shareName: fileShare.name,
                storageAccountKey: storageAccountKeys.keys[0].value,
                storageAccountName: storageAccount.name
              },
              name: 'scripts'
            }
          ]
        }
      )

      return {}
    }

    // Create our stack
    const args: InlineProgramArgs = {
      stackName: 'dev',
      projectName: 'inlineNode',
      program: pulumiProgram
    }

    // create (or select if one already exists) a stack that uses our inline program
    const stack = await LocalWorkspace.createOrSelectStack(args)

    await stack.workspace.installPlugin('azure-native', 'v1.65.0')
    await stack.workspace.installPlugin('azure', 'v5.10.0')

    await stack.setConfig('azure-native:location', { value: 'West Europe' })
    await stack.setConfig('azure:location', { value: 'West Europe' })
    await stack.refresh({ onOutput: console.info })

    const upRes = await stack.up({ onOutput: console.info })
    console.log(
      `update summary: \n${JSON.stringify(
        upRes.summary.resourceChanges,
        null,
        4
      )}`
    )
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
