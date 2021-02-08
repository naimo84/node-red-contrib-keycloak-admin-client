
import { NodeMessageInFlow, NodeMessage } from "node-red";

import KcAdminClient from 'keycloak-admin';
import { KeycloakConfig } from "./helper";
import { compile } from "handlebars";

export interface ClientcomponentMessage extends NodeMessageInFlow {
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
            component: node?.componenttype !== 'json' ? msg?.payload?.component : JSON.parse(node?.component),
            protocolMapper: node?.protocolMappertype !== 'json' ? msg?.payload?.protocolMapper : JSON.parse(node?.protocolMapper),
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

    function componentsNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;
        node.component = config.component;
        node.componenttype = config.componenttype;
        node.protocolMapper = config.protocolMapper;
        node.protocolMappertype = config.protocolMappertype;
        node.action = config.action;
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

    async function processInput(node, msg: ClientcomponentMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg)
        let payload = {};
        let payloaderror;
        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });

        if (!kcConfig.action || kcConfig.action === 'get') {
            payload = await kcAdminClient.components.find();
        } else if (kcConfig.action === 'create') {
            try {
                let components = await kcAdminClient.components.find();
                let exists = Object.keys(components).some((item, idx) => {
                    if (components[idx].name === kcConfig.component.name) {
                        payload = components[idx];
                        return true;
                    }
                })
                if (!exists) {
                    try {
                        const template = compile(JSON.stringify(kcConfig.component));
                        kcConfig.component = JSON.parse(template({ msg: msg }));
                        let compId = await kcAdminClient.components.create(kcConfig.component)
                        node.status({ shape: 'dot', fill: 'green', text: `${kcConfig.component.name} created` })

                    } catch (err) {
                        payloaderror = err;
                        node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.component.name} already exists` })

                    }
                    let components2 = await kcAdminClient.components.find();
                    for (let component of components2) {
                        if (component.name === kcConfig.component.name) {
                            payload = component;
                            break;
                        }
                    }
                } else {
                    node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.component.name} already exists` })
                }
            } catch (err) {
                payloaderror = err;
                node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.component.name} already exists` })
            }

        }

        let newMsg = Object.assign(RED.util.cloneMessage(msg),{
            payload: payload,          
            realm: kcConfig.realmName
        });
        
        send(newMsg)

        setTimeout(() => node.status({ text: `` }), 10000)
        if (done && !payloaderror) done();
        else done(payloaderror);
    }

    RED.nodes.registerType("keycloak-components", componentsNode);
}