
import { NodeMessageInFlow, NodeMessage } from "node-red";
import { KeycloakConfig, mergeDeep } from "./helper";
import KcAdminClient from 'keycloak-admin';
import axios, { AxiosRequestConfig, Method } from 'axios';

export interface RealmMessage extends NodeMessageInFlow {
    payload: {
        execution_id: string;
        config: any;
    }
}

module.exports = function (RED: any) {


    function getConfig(config: any, node?: any, msg?: any): KeycloakConfig {
        const cloudConfig = {
            baseUrl: config?.baseUrl,
            realmName: node?.realmName || 'master',
            username: config?.credentials?.username,
            password: config?.credentials?.password,
            grantType: config?.grantType || 'password',
            clientId: config?.clientId || msg?.clientId || 'admin-cli',
            name: msg?.name || config?.name,
            action: msg?.action || node?.action || 'get',
            provider: node?.providertype !== 'json' ? msg?.payload?.provider : JSON.parse(node?.provider)
        } as KeycloakConfig;

        return cloudConfig;
    }

    function identityProviderNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;
        node.action = config.action;
        node.provider = config.provider;
        node.providertype = config.providertype;
        node.status({ text: `` })
        try {
            node.msg = {};
            node.on('input', (msg, send, done) => {
                node.msg = RED.util.cloneMessage(msg);
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
                //@ts-ignore
                if (msg.payload?.provider) {
                    //@ts-ignore
                    kcConfig.provider = mergeDeep(kcConfig.provider, msg.payload.provider)
                }

                payload = await kcAdminClient.identityProviders.create(kcConfig.provider)
                node.status({text:`${kcConfig.provider.displayName} created`})

            }
        } catch (err) {
            payload = {
                created: false
            }
            node.status({text:`${kcConfig.provider.displayName} already exists`})

        }

        send({
            payload: payload,
            //@ts-ignore
            realmName: kcConfig.realmName
        })
        setTimeout(()=> node.status({ text: `` }),10000)
        if (done) done();
    }

    RED.nodes.registerType("keycloak-identity-providers", identityProviderNode);
}