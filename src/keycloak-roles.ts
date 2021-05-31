
import { NodeMessageInFlow, NodeMessage, Node } from "node-red";
import { UserMessage, KeycloakConfig, mergeDeep } from "./helper";
import KcAdminClient from 'keycloak-admin';
import { compile } from "handlebars";

module.exports = function (RED: any) {
    function getConfig(config: any, node?: any, msg?: any): KeycloakConfig {
        const nodeConfig = {
            baseUrl: config.useenv ? process.env[config.baseUrlEnv] : config.baseUrl,
            realmName: node?.realmName || 'master',            
            grantType: config?.grantType || 'password',
            role: node?.role,
            name: msg?.name || config?.name,
            action: msg?.action || node?.action || 'get',
        } as KeycloakConfig;
        return nodeConfig;
    }

    function rolesNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
       
        node.action = config.action;       
        node.status({ text: `` })
        try {
            node.msg = {};
            node.on('input', (msg, send, done) => {
                node.realmName = RED.util.evaluateNodeProperty(config.realmName, config.realmNametype, node, msg);
                node.role = RED.util.evaluateNodeProperty(config.role, config.usertype, node, msg);
                
                send = send || function () { node.send.apply(node, arguments) }
                processInput(node, msg, send, done, config.confignode);
            });
        }
        catch (err) {
            node.error('Error: ' + err.message);
            node.status({ fill: "red", shape: "ring", text: err.message })
        }
    }

    async function processInput(node: Node, msg: any, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg)
        let payload = {};

        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });
        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                payload = await kcAdminClient.roles.find();

            } else if (kcConfig.action === 'create') {
                let role = kcConfig.role.toString();
                if (msg?.payload?.role) {
                    role = msg.payload.role
                }
              
                try {
                    let payload = await kcAdminClient.roles.findOneByName({ name: role })
                    if (!payload) {
                        await kcAdminClient.roles.create({
                            name: role,
                            description: role,
                            scopeParamRequired: false
                        })
                        payload = await kcAdminClient.roles.findOneByName({ name: role })
                        node.status({ shape: 'dot', fill: 'green', text: `${role} created` })
                    }
                    else{
                        node.status({ shape: 'dot', fill: 'yellow', text: `${role} already exists` })

                    }

                    
                } catch (err) {                         
                    //@ts-ignore
                    node.status({ shape: 'dot', fill: 'yellow', text: err })
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

    RED.nodes.registerType("keycloak-roles", rolesNode);
}