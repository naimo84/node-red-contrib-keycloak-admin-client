
import { NodeMessageInFlow, NodeMessage, Node } from "node-red";
import { ClientMessage, KeycloakConfig, mergeDeep, nodelog } from "./helper";
import KcAdminClient from 'keycloak-admin';
import { compile } from "handlebars";
var debug = require('debug')('keycloak:clients')

module.exports = function (RED: any) {
    function getConfig(config: any, node?: any, msg?: any, input?:KeycloakConfig): KeycloakConfig {
        const nodeConfig = {
            baseUrl: config.useenv ? process.env[config.baseUrlEnv] : config.baseUrl,
            realmName: input?.realmName || 'master',
            username: config?.credentials?.username,
            password: config?.credentials?.password,
            grantType: config?.grantType || 'password',
            clientId: config?.clientId || msg?.clientId || 'admin-cli',
            name: msg?.name || config?.name,
            action: msg?.action || node?.action || 'get',
            client: input.client,
            role: input.role,
        } as KeycloakConfig;


        return nodeConfig;
    }

    function clientsNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.action = config.action;

        node.status({ text: `` })
        try {
            node.msg = {};
            node.on('input', (msg, send, done) => {
                let input:KeycloakConfig = {
                    client: RED.util.evaluateNodeProperty(config.client, config.clienttype, node, msg),
                    realmName: RED.util.evaluateNodeProperty(config.realmName, config.realmNametype, node, msg),
                    role: RED.util.evaluateNodeProperty(config.role, config.roletype, node, msg)
                }
                send = send || function () { node.send.apply(node, arguments) }
                processInput(node, msg, send, done, config.confignode, input);
            });
        }
        catch (err) {
            node.error('Error: ' + err.message);
            node.status({ fill: "red", shape: "ring", text: err.message })
            nodelog({
                debug,
                action: "error",
                message:  err.message , item: err , realm: ''
            })
        }
    }

    async function processInput(node: Node, msg: ClientMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config, input:KeycloakConfig) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg, input)
        let payload = {};

        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });
        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                let client = kcConfig.client;
                payload = await kcAdminClient.clients.find(client);

            } else if (kcConfig.action === 'create') {
                let client = kcConfig.client;
                if (msg?.payload?.client) {
                    client = mergeDeep(client, msg.payload.client)
                }
                const template = compile(JSON.stringify(client));
                client = JSON.parse(template({ msg: msg }));

                try {
                    payload = Object.assign(client, await kcAdminClient.clients.create(client));
                    node.status({ shape: 'dot', fill: 'green', text: `${client.clientId} created` })
                    nodelog({
                        debug,
                        action: "create",
                        message: "created", 
                        item: client, realm: kcConfig.realmName
                    })
                } catch (err) {
                    let payloadClients = await kcAdminClient.clients.find({ clientId: client?.clientId });
                    payload = payloadClients ? payloadClients[0] : {}
                    //@ts-ignore
                    node.status({ shape: 'dot', fill: 'yellow', text: `${client.clientId} already exists` })
                    nodelog({
                        debug,
                        action: "create",
                        message: "already exists", 
                        item: client, realm: kcConfig.realmName
                    })
                }
            } else if (kcConfig.action === 'update') {
                let client = kcConfig.client;
                if (msg?.payload?.client) {
                    client = mergeDeep(client, msg.payload.client)
                }
                const template = compile(JSON.stringify(client));
                client = JSON.parse(template({ msg: msg }));

                try {
                    payload = Object.assign(client, await kcAdminClient.clients.update({ id: client?.id }, client));
                    node.status({ shape: 'dot', fill: 'green', text: `${client.clientId} updated` })
                    nodelog({
                        debug,
                        action: "update",
                        message: "updated", 
                        item: client, realm: kcConfig.realmName
                    })
                } catch (err) {
                    let payloadClients = await kcAdminClient.clients.find({ clientId: client?.clientId });
                    payload = payloadClients ? payloadClients[0] : {}
                    //@ts-ignore
                    node.status({ shape: 'dot', fill: 'yellow', text: `${client.clientId} already exists` })
                    nodelog({
                        debug,
                        action: "update",
                        message: "already exists", 
                        item: client, realm: kcConfig.realmName
                    })
                }
            } else if (kcConfig.action === 'getSecret') {
                let client = Object.assign(msg.payload, { realm: kcConfig.realmName }) as any;
                let secret = await kcAdminClient.clients.getClientSecret(client)
                payload = Object.assign(client, { secret: secret.value })
            } else if (kcConfig.action === 'addServiceAccountRole') {
                const serviceAccountUser = await kcAdminClient.clients.getServiceAccountUser({ id: kcConfig.client.id });

                let roles = convertToArray(kcConfig.role);
                for (let role of roles) {
                    if (!serviceAccountUser?.realmRoles?.includes(role)) {
                        let currentRole = await addRealmRole(kcAdminClient, role);
                        await kcAdminClient.users.addRealmRoleMappings({
                            id: serviceAccountUser.id,
                            roles: [
                                {
                                    id: currentRole.id,
                                    name: currentRole.name,
                                },
                            ],
                        });
                        node.status({ shape: 'dot', fill: 'green', text: `role ${currentRole.name} added to ${kcConfig.client.name}` })
                        nodelog({
                            debug,
                            action: "addServiceAccountRole",
                            message: `role ${currentRole.name} added`, 
                            item: kcConfig.client, realm: kcConfig.realmName
                        })
                    }
                }
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


    function convertToArray(obj): string[] {
        if (obj instanceof Array) {
            return obj;
        } else {
            return [obj];
        }
    }

    async function addRealmRole(kcAdminClient: KcAdminClient, role: string) {
        let retRole = await kcAdminClient.roles.findOneByName({ name: role })
        if (!retRole) {
            await kcAdminClient.roles.create({
                name: role,
                description: role,
                scopeParamRequired: false
            })
            retRole = await kcAdminClient.roles.findOneByName({ name: role })
        }
        return retRole;
    }

    RED.nodes.registerType("keycloak-clients", clientsNode);
}