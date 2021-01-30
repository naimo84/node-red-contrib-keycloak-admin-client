
import { NodeMessageInFlow, NodeMessage } from "node-red";
import { ClientMessage, KeycloakConfig } from "./helper";
import KcAdminClient from 'keycloak-admin';

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
            client: node?.clienttype !== 'json' ? msg?.payload?.client : JSON.parse(node?.client)
        } as KeycloakConfig;

        return cloudConfig;
    }

    function eventsNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;
        node.action = config.action;
        node.client = config.client;
        node.clienttype = config.clienttype;
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

    async function processInput(node, msg: ClientMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg)
        let payload = {};

        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });
        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                payload = await kcAdminClient.clients.find();

            } else if (kcConfig.action === 'create') {
                let client = kcConfig.client;
                if (msg?.payload?.client) {
                    client = Object.assign(client, msg.payload.client)
                }
                try {
                    payload = await kcAdminClient.clients.create(client)
                } catch {
                    let payloadClients = await kcAdminClient.clients.find({ clientId: client?.clientId });
                    payload = payloadClients ? payloadClients[0] : {}
                }
            } else if (kcConfig.action === 'getSecret') {
                let client = Object.assign(msg.payload, { realm: kcConfig.realmName }) as any;
                let secret = await kcAdminClient.clients.getClientSecret(client)
                payload = Object.assign(client, { secret: secret.value })
            }

        } catch (err) {
            payload = await kcAdminClient.clients.find();
        }
        send({
            payload: payload,
            //@ts-ignore
            realmName: kcConfig.realmName
        })
        if (done) done();
    }

    RED.nodes.registerType("keycloak-clients", eventsNode);
}