
import { NodeMessage, Node } from "node-red";
import { KeycloakConfig, nodelog } from "./helper";
import KcAdminClient from 'keycloak-admin';
var debug = require('debug')('keycloak:roles')

module.exports = function (RED: any) {
    function getConfig(config: any, node?: any, msg?: any, input?: KeycloakConfig): KeycloakConfig {
        const nodeConfig = {
            baseUrl: config.useenv ? process.env[config.baseUrlEnv] : config.baseUrl,
            realmName: input?.realmName || 'master',
            grantType: config?.grantType || 'password',
            role: input?.role,
            compositerole: input?.compositerole,
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
                let input: KeycloakConfig = {
                    realmName: RED.util.evaluateNodeProperty(config.realmName, config.realmNametype, node, msg),
                    role: RED.util.evaluateNodeProperty(config.role, config.roletype, node, msg),
                    compositerole: RED.util.evaluateNodeProperty(config.compositerole, config.compositeroletype, node, msg)
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
                message: err.message, item: err, realm: ''
            })
        }
    }

    async function processInput(node: Node, msg: any, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config, input: KeycloakConfig) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg, input)
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
                        nodelog({
                            debug,
                            action: "create",
                            message: "created",
                            item: role, realm: kcConfig.realmName
                        })
                    }
                    else {
                        node.status({ shape: 'dot', fill: 'yellow', text: `${role} already exists` })
                        nodelog({
                            debug,
                            action: "create",
                            message: "already exists",
                            item: role, realm: kcConfig.realmName
                        })
                    }


                } catch (err) {
                    //@ts-ignore
                    node.status({ shape: 'dot', fill: 'yellow', text: err })
                }
            } else if (kcConfig.action === 'createComposite') {              
                let currentRole = await kcAdminClient.roles.findOneByName({ name: kcConfig.role.toString() });                
                let compositeRole = await kcAdminClient.roles.findOneByName({ name: kcConfig.compositerole.toString() });
                await kcAdminClient.roles.createComposite({ roleId: compositeRole.id }, [currentRole]);
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