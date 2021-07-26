
import { NodeMessageInFlow, NodeMessage, Node } from "node-red";
import { UserMessage, KeycloakConfig, mergeDeep, nodelog } from "./helper";
import KcAdminClient from 'keycloak-admin';
import { compile } from "handlebars";
var debug = require('debug')('keycloak:users')

module.exports = function (RED: any) {
    function getConfig(config: any, node?: any, msg?: any, input?: KeycloakConfig): KeycloakConfig {
        const nodeConfig = {
            baseUrl: config.useenv ? process.env[config.baseUrlEnv] : config.baseUrl,
            realmName: input?.realmName || 'master',
            grantType: config?.grantType || 'password',
            user: input?.user,
            password: input?.password,
            name: msg?.name || config?.name,
            action: msg?.action || node?.action || 'get',
        } as KeycloakConfig;
        return nodeConfig;
    }

    function usersNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;

        node.action = config.action;
        node.status({ text: `` })
        try {
            node.msg = {};
            node.on('input', (msg, send, done) => {
                let input: KeycloakConfig = {
                    realmName: RED.util.evaluateNodeProperty(config.realmName, config.realmNametype, node, msg),
                    user: RED.util.evaluateNodeProperty(config.user, config.usertype, node, msg),
                    password: RED.util.evaluateNodeProperty(config.password, config.passwordtype, node, msg)
                }
                send = send || function () { node.send.apply(node, arguments) }
                processInput(node, msg, send, done, config.confignode, input);
            });
        }
        catch (err) {
            node.error('Error: ' + err.message);
            node.status({ fill: "red", shape: "ring", text: err.message })

        }
    }

    async function processInput(node: Node, msg: UserMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config, input: KeycloakConfig) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg, input)
        let payload = {};

        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });
        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                let user = kcConfig.user;

                if (msg?.user) {
                    user = Object.assign(user, msg.user)
                }
                const template = compile(JSON.stringify(user));
                user = JSON.parse(template({ msg: msg }));
                if (!user || (!user['search'] && !user['username']))
                    //@ts-ignore
                    payload = await kcAdminClient.users.find();
                else
                    //@ts-ignore
                    payload = await kcAdminClient.users.find(JSON.parse(`{ "${!!user['search'] ? 'search' : 'username'}": "${!!user['search'] ? user?.search : user?.username}" }`));

            } else if (kcConfig.action === 'create') {
                let user = kcConfig.user;
                if (msg?.user) {
                    user = mergeDeep(user || {}, msg.user)
                }
                const template = compile(JSON.stringify(user));
                user = JSON.parse(template({ msg: msg }));
                try {
                    payload = Object.assign(user, await kcAdminClient.users.create(user));
                    node.status({ shape: 'dot', fill: 'green', text: `${user.username} created` })
                } catch (err) {
                    console.log(` ${err}`);

                    let payloadClients = await kcAdminClient.users.find({ username: user?.username });
                    payload = payloadClients ? payloadClients[0] : {}
                    //@ts-ignore
                    node.status({ shape: 'dot', fill: 'yellow', text: `${user.username} already exists` })
                }
            } else if (kcConfig.action === 'resetPassword') {
                let user = kcConfig.user;
                let password = kcConfig.password;
                if (msg?.user) {
                    user = Object.assign(user, msg.user)
                }
                const template = compile(JSON.stringify(user));
                user = JSON.parse(template({ msg: msg }));
                try {
                    payload = Object.assign(user, await kcAdminClient.users.resetPassword({
                        id: user.id,
                        credential: {
                            temporary: false,
                            type: 'password',
                            value: password
                        }
                    }));
                    node.status({ shape: 'dot', fill: 'green', text: `${user.username} created` })

                } catch (err) {
                    let payloadClients = await kcAdminClient.users.find({ username: user?.username });
                    payload = payloadClients ? payloadClients[0] : {}
                    //@ts-ignore
                    node.status({ shape: 'dot', fill: 'yellow', text: `${err.response?.data?.error}` })
                }
            } else if (kcConfig.action === 'update') {
                let user = kcConfig.user;

                if (msg.user) {
                    user = mergeDeep(user, msg.user)
                }
                const template = compile(JSON.stringify(user));
                user = JSON.parse(template({ msg: msg }));
                try {
                    payload = Object.assign(user, await kcAdminClient.users.update({ id: user.id }, user))
                    node.status({ shape: 'dot', fill: 'green', text: `${user.username} updated` })
                    nodelog({
                        debug,
                        action: "update",
                        message: "updated",
                        item: user, realm: kcConfig.realmName
                    })
                } catch (err) {
                    let payloadClients = await kcAdminClient.users.find({ username: user?.username });
                    payload = payloadClients ? payloadClients[0] : {}
                    //@ts-ignore
                    node.status({ shape: 'dot', fill: 'yellow', text: `${err.response?.data?.error}` })
                    nodelog({
                        debug,
                        action: "update",
                        message: "error",
                        item: err, realm: kcConfig.realmName
                    })
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

    RED.nodes.registerType("keycloak-users", usersNode);
}