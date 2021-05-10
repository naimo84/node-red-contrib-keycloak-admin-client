
import { NodeMessageInFlow, NodeMessage, Node } from "node-red";
import { UserMessage, KeycloakConfig } from "./helper";
import KcAdminClient from 'keycloak-admin';
import { compile } from "handlebars";

module.exports = function (RED: any) {
    function getConfig(config: any, node?: any, msg?: any): KeycloakConfig {
        const nodeConfig = {
            baseUrl: config.useenv ? process.env[config.baseUrlEnv] : config.baseUrl,
            realmName: node?.realmName || 'master',
            username: config?.credentials?.username,
            password: config?.credentials?.password,
            grantType: config?.grantType || 'password',
            user: config?.user || msg?.user,
            name: msg?.name || config?.name,
            action: msg?.action || node?.action || 'get',
        } as KeycloakConfig;

        if (node?.usertype !== 'json') {
            nodeConfig.user = msg[node.user]
        }
        else {
            nodeConfig.user = JSON.parse(node?.user)
        }

        if (node?.passwordtype !== 'str') {
            nodeConfig.password = msg[node.password]
        }
        else {
            nodeConfig.password = node?.password
        }

        switch (node?.realmNametype) {
            case 'msg':
                nodeConfig.realmName = msg[node.realmName]
                break;
            case 'str':
                nodeConfig.realmName = node?.realmName
                break;
            case 'flow':
                nodeConfig.realmName = node.context().flow.get(node.realmName)
                break;
            case 'global':
                nodeConfig.realmName = node.context().global.get(node.realmName)
                break;
        }

        return nodeConfig;
    }

    function usersNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;
        node.realmNametype = config.realmNametype;
        node.action = config.action;
        node.user = config.user;
        node.usertype = config.usertype;
        node.password = config.password;
        node.passwordtype = config.passwordtype;
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

    async function processInput(node: Node, msg: UserMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg)
        let payload = {};

        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });
        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                payload = await kcAdminClient.users.find();

            } else if (kcConfig.action === 'create') {
                let user = kcConfig.user;
                if (msg?.payload?.user) {
                    user = Object.assign(user, msg.payload.user)
                }
                const template = compile(JSON.stringify(user));
                user = JSON.parse(template({ msg: msg }));
                try {
                    payload = Object.assign(user, await kcAdminClient.users.create(user));
                    node.status({ shape: 'dot', fill: 'green', text: `${user.username} created` })
                } catch (err) {
                    console.log(` ${err}` );
                    
                    let payloadClients = await kcAdminClient.users.find({ username: user?.username });
                    payload = payloadClients ? payloadClients[0] : {}
                    //@ts-ignore
                    node.status({ shape: 'dot', fill: 'yellow', text: `${user.username} already exists` })
                }
            } else if (kcConfig.action === 'resetPassword') {
                let user = kcConfig.user;
                let password = kcConfig.password;
                if (msg?.payload?.user) {
                    user = Object.assign(user, msg.payload.user)
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