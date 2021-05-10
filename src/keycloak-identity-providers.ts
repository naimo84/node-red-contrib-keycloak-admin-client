
import { NodeMessageInFlow, NodeMessage } from "node-red";
import { KeycloakConfig, mergeDeep } from "./helper";
import KcAdminClient from 'keycloak-admin';

export interface RealmMessage extends NodeMessageInFlow {
    payload: {
        execution_id: string;
        config: any;
    }
}

module.exports = function (RED: any) {
    function getConfig(config: any, node?: any, msg?: any): KeycloakConfig {
        const nodeConfig = {
            baseUrl: config.useenv ? process.env[config.baseUrlEnv] : config.baseUrl,
            realmName: node?.realmName || 'master',
            username: config?.credentials?.username,
            password: config?.credentials?.password,
            grantType: config?.grantType || 'password',
            name: msg?.name || config?.name,
            action: msg?.action || node?.action || 'get'
        } as KeycloakConfig;

        if (node?.providertype !== 'json') {
            nodeConfig.provider = msg[node.provider]
        } else {
            nodeConfig.provider = JSON.parse(node?.provider)
        }

        switch (node?.realmNametype) {
            case 'msg':
                nodeConfig.realmName = msg[node.realmName]
                break;
            case 'str':
                nodeConfig.realmName = node?.realmName
                break;
            case 'flow':
                nodeConfig.realmName = node.context().flow.get(node.realmName)
                break;
            case 'global':
                nodeConfig.realmName = node.context().global.get(node.realmName)
                break;
        }

        return nodeConfig;
    }

    function identityProviderNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;
        node.realmNametype = config.realmNametype;
        node.action = config.action;
        node.provider = config.provider;
        node.providertype = config.providertype;
        node.status({ text: `` })
        try {
            node.msg = {};
            node.on('input', (msg, send, done) => {
                send = send || function () { node.send.apply(node, arguments) }
                processInput(node, msg, send, done, config.confignode);
            });
        }
        catch (err) {
            node.error('Error: ' + err.message);
            node.status({ fill: "red", shape: "ring", text: err.message })
        }
    }

    async function processInput(node, msg: RealmMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg)
        let payload = {};

        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });
        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                payload = await kcAdminClient.identityProviders.find();
            } else if (kcConfig.action === 'create') {
                try {
                    //@ts-ignore
                    if (msg.payload?.provider) {
                        //@ts-ignore
                        kcConfig.provider = mergeDeep(kcConfig.provider, msg.payload.provider)
                    }

                    payload = await kcAdminClient.identityProviders.create(kcConfig.provider)
                    node.status({ shape: 'dot', fill: 'green', text: `${kcConfig.provider.displayName} created` })
                } catch {
                    payload = {
                        created: false
                    }
                    node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.provider.displayName} already exists` })
                }
            } else if (kcConfig.action === 'getMappers') {
                payload = await kcAdminClient.identityProviders.findMappers({ alias: 'myodav' });
            } else if (kcConfig.action === 'addMapper') {
                await kcAdminClient.identityProviders.createMapper({
                    alias: "myodav",
                    identityProviderMapper: {
                        config: {
                            claims: `[{"key":"organisation","value":"^ 24$|^ 100$"}]`,
                            role: "CRM",
                            syncMode: "FORCE",
                            "are.claim.values.regex": "true"
                        },
                        identityProviderAlias: "myodav",
                        identityProviderMapper: "oidc-advanced-role-idp-mapper",
                        name: "CRMRoleMapper",

                    }
                })
            }

            let newMsg = Object.assign(RED.util.cloneMessage(msg), {
                payload: payload,
                realm: kcConfig.realmName
            });

            send(newMsg)
            if (done) done();

        } catch (err) {
            node.status({ shape: 'dot', fill: 'red', text: `${err}` })
            if (done) done(err);
        }

        setTimeout(() => node.status({ text: `` }), 10000)
    }

    RED.nodes.registerType("keycloak-identity-providers", identityProviderNode);
}