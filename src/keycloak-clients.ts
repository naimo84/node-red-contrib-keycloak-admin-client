
import { NodeMessageInFlow, NodeMessage, Node } from "node-red";
import { ClientMessage, KeycloakConfig } from "./helper";
import KcAdminClient from 'keycloak-admin';
import { compile } from "handlebars";

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

        switch (node?.realmNametype) {
            case 'msg':
                cloudConfig.realmName = msg[node.realmName]
                break;
            case 'str':
                cloudConfig.realmName = node?.realmName
                break;
            case 'flow':
                cloudConfig.realmName = node.context().flow.get(node.realmName)
                break;
            case 'global':
                cloudConfig.realmName = node.context().global.get(node.realmName)
                break;
        }

        return cloudConfig;
    }

    function clientsNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;
        node.realmNametype = config.realmNametype;
        node.action = config.action;
        node.client = config.client;
        node.clienttype = config.clienttype;
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

    async function processInput(node: Node, msg: ClientMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config) {
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
                const template = compile(JSON.stringify(client));
                client = JSON.parse(template({ msg: msg }));
                try {
                    payload = Object.assign(client, await kcAdminClient.clients.create(client));
                    node.status({ shape: 'dot', fill: 'green', text: `${client.clientId} created` })
                } catch (err) {

                    let payloadClients = await kcAdminClient.clients.find({ clientId: client?.clientId });
                    payload = payloadClients ? payloadClients[0] : {}
                    //@ts-ignore
                    node.status({ shape: 'dot', fill: 'yellow', text: `${client.clientId} already exists` })
                }
            } else if (kcConfig.action === 'getSecret') {
                let client = Object.assign(msg.payload, { realm: kcConfig.realmName }) as any;
                let secret = await kcAdminClient.clients.getClientSecret(client)
                payload = Object.assign(client, { secret: secret.value })
            }

        } catch (err) {
            console.log(err);

            payload = await kcAdminClient.clients.find();
        }

        let newMsg = Object.assign(RED.util.cloneMessage(msg), {
            payload: payload,
            realm: kcConfig.realmName
        });

        send(newMsg)
        setTimeout(() => node.status({ text: `` }), 10000)
        if (done) done();
    }

    RED.nodes.registerType("keycloak-clients", clientsNode);
}