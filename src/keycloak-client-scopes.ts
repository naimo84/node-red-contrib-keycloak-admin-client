
import { NodeMessageInFlow, NodeMessage,EditorRED } from "node-red";

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
        } as KeycloakConfig;

        switch (node?.realmNametype) {
            case 'msg':
                cloudConfig.realmName = msg[node.realmName]
                break;
            case 'str':
                cloudConfig.realmName = JSON.parse(node?.realmName)
                break;
            case 'flow':
                cloudConfig.realmName = node.context().flow.get(node.realmName)
                break;
            case 'global':
                cloudConfig.realmName = node.context().global.get(node.realmName)
                break;
        }

        if (node?.protocolMappertype !== 'json') {
            cloudConfig.protocolMapper = msg[node.protocolMapper]
        } else {
            cloudConfig.protocolMapper = JSON.parse(node?.protocolMapper)
        }

        if (node?.scopetype !== 'json') {
            cloudConfig.scope = msg[node.scope]
        } else {
            cloudConfig.scope = JSON.parse(node?.scope)
        }

        return cloudConfig;
    }

    function clientScopeNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;
        node.realmNametype = config.realmNametype;
        
        node.scope = config.scope;
        node.scopetype = config.scopetype;
        node.protocolMapper = config.protocolMapper;
        node.protocolMappertype = config.protocolMappertype;
        node.action = config.action;
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
                node.status({ text: `${kcConfig.scope.name} created` })

            } catch {
                node.status({ text: `${kcConfig.scope.name} already exists` })

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
                node.status({ text: `${kcConfig.protocolMapper.name} created` })
            } else {
                node.status({ text: `${kcConfig.protocolMapper.name} already exists` })
            }
        }

        send({
            //@ts-ignore
            realmName: kcConfig.realmName,
            payload: payload
        })

        setTimeout(() => node.status({ text: `` }), 10000)
        if (done) done();
    }

    RED.nodes.registerType("keycloak-client-scopes", clientScopeNode);
}