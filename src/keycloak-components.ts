import { NodeMessageInFlow, NodeMessage } from "node-red";
import KcAdminClient from 'keycloak-admin';
import { KeycloakConfig, nodelog } from "./helper";
import { compile } from "handlebars";
var debug = require('debug')('keycloak:client-scopes')

export interface ClientcomponentMessage extends NodeMessageInFlow {
    payload: {
        execution_id: string;
        config: any;
    }
}

module.exports = function (RED: any) {
    function getConfig(config: any, node?: any, msg?: any, input?: KeycloakConfig): KeycloakConfig {
        const nodeConfig = {
            baseUrl: config.useenv ? process.env[config.baseUrlEnv] : config.baseUrl,
            realmName: input?.realmName || 'master',
            username: config?.credentials?.username,
            password: config?.credentials?.password,
            grantType: config?.grantType || 'password',
            name: msg?.name || config?.name,
            action: msg?.action || node?.action || 'get'    ,
            component: input.component,
            protocolMapper:input.protocolMapper  
        } as KeycloakConfig;
      
        return nodeConfig;
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
                let input: KeycloakConfig = {
                    component:RED.util.evaluateNodeProperty(config.component, config.componentype, node, msg),                  
                    protocolMapper:RED.util.evaluateNodeProperty(config.protocolMapper, config.protocolMappertype, node, msg),                  
                    realmName: RED.util.evaluateNodeProperty(config.realmName, config.realmNametype, node, msg),
                }


                send = send || function () { node.send.apply(node, arguments) }
                processInput(node, msg, send, done, config.confignode,input);
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

    async function processInput(node, msg: ClientcomponentMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config, input:KeycloakConfig) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg,input)
        let payload = {};
        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });

        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                payload = await kcAdminClient.components.find();
            } else if (kcConfig.action === 'create') {
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
            }
            let newMsg = Object.assign(RED.util.cloneMessage(msg), {
                payload: payload,
                realm: kcConfig.realmName
            });

            send(newMsg)

            setTimeout(() => node.status({ text: `` }), 10000)
            if (done) done();
        } catch (err) {
            node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.component.name} already exists` })
            done(err);
        }
    }

    RED.nodes.registerType("keycloak-components", componentsNode);
}