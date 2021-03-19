
import { NodeMessageInFlow, NodeMessage, EditorRED } from "node-red";

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
        const nodeConfig = {
            baseUrl: config?.baseUrl,
            realmName: node?.realmName || 'master',
            username: config?.credentials?.username,
            password: config?.credentials?.password,
            grantType: config?.grantType || 'password',
            name: msg?.name || config?.name,
            action: msg?.action || node?.action || 'get',
        } as KeycloakConfig;
        nodeConfig.protocolMapper = node.protocolMapper
        nodeConfig.scope = node.scope
        return nodeConfig;
    }

    function clientScopeNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;

        node.action = config.action;
        node.status({ text: `` })
        try {
            node.msg = {};
            node.on('input', (msg, send, done) => {
                node.scope = RED.util.evaluateNodeProperty(config.scope, config.scopetype, node, msg);
                if(!!config.protocolMapper) node.protocolMapper = RED.util.evaluateNodeProperty(config.protocolMapper, config.protocolMappertype, node, msg);
                node.realmName = RED.util.evaluateNodeProperty(config.realmName, config.realmNametype, node, msg);

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
        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                if (!kcConfig.scope) {
                    payload = await kcAdminClient.clientScopes.find();
                } else {
                    payload = await kcAdminClient.clientScopes.findOneByName({ name: kcConfig.scope.name });
                }
            } else if (kcConfig.action === 'create') {
                try {
                    await kcAdminClient.clientScopes.create(kcConfig.scope)
                    node.status({ shape: 'dot', fill: 'green', text: `${kcConfig.scope.name} created` })

                } catch {
                    node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.scope.name} already exists` })
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
                //@ts-ignore
                if (msg.protocolmapper) {
                    //@ts-ignore
                    kcConfig.protocolMapper = Object.assign(kcConfig.protocolMapper, msg.protocolmapper)
                }
                let protocolMapper = await kcAdminClient.clientScopes.findProtocolMapperByName({ id, name: kcConfig.protocolMapper.name });
                if (!protocolMapper) {
                    await kcAdminClient.clientScopes.addProtocolMapper({ id }, kcConfig.protocolMapper);
                    node.status({ shape: 'dot', fill: 'green', text: `${kcConfig.protocolMapper.name} added` })
                } else {
                    node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.protocolMapper.name} already exists` })
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

    RED.nodes.registerType("keycloak-client-scopes", clientScopeNode);
}