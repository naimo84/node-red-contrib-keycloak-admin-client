
import { NodeMessageInFlow, NodeMessage } from "node-red";

import KcAdminClient from 'keycloak-admin';
import ClientScopeRepresentation from "keycloak-admin/lib/defs/clientScopeRepresentation";
import { KeycloakConfig } from "./helper";

export interface ClientScopeMessage extends NodeMessageInFlow {
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
            client: node?.clienttype !== 'json' ? msg?.payload?.client : JSON.parse(node?.client),
            scope: node?.scopetype !== 'json' ? msg?.payload?.scope : JSON.parse(node?.scope),
            protocolMapper: node?.protocolMappertype !== 'json' ? msg?.payload?.protocolMapper : JSON.parse(node?.protocolMapper)
        } as KeycloakConfig;

        return cloudConfig;
    }

    function eventsNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;
        node.scope = config.scope;
        node.scopetype = config.scopetype;
        node.protocolMapper = config.protocolMapper;
        node.protocolMappertype = config.protocolMappertype;
        node.action = config.action;

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

    async function processInput(node, msg: ClientScopeMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg)
        let payload = {};

        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });

        if (!kcConfig.action || kcConfig.action === 'get') {
            payload = await kcAdminClient.clientScopes.find();
        } else if (kcConfig.action === 'create') {
            try {
                await kcAdminClient.clientScopes.create(kcConfig.scope)
            } catch {

            }
            let scopes = await kcAdminClient.clientScopes.find();
            for (let scope of scopes) {
                if (scope.name === kcConfig.scope.name) {
                    payload = scope;
                    break;
                }
            }


        } else if (kcConfig.action === 'addProtocolMapper') {
            let id = kcConfig.scope.id;
            await kcAdminClient.clientScopes.addProtocolMapper({ id }, kcConfig.protocolMapper);
        }

        send({
            //@ts-ignore
            realmName: kcConfig.realmName,
            payload: payload
        })
        if (done) done();
    }

    RED.nodes.registerType("keycloak-client-scopes", eventsNode);
}