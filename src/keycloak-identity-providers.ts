
import { NodeMessageInFlow, NodeMessage } from "node-red";
import { KeycloakConfig, mergeDeep, nodelog } from "./helper";
import KcAdminClient from 'keycloak-admin';
var debug = require('debug')('keycloak:identity-provider')

export interface RealmMessage extends NodeMessageInFlow {
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
            providermapper: input?.providermapper,
            provider: input?.provider,
            action: msg?.action || node?.action || 'get'
        } as KeycloakConfig;

        return nodeConfig;
    }

    function identityProviderNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.action = config.action;
        node.status({ text: `` })
        try {
            node.msg = {};
            node.on('input', (msg, send, done) => {
                let input: KeycloakConfig = {
                    providermapper: RED.util.evaluateNodeProperty(config.providermapper, config.providermappertype, node, msg),
                    provider: RED.util.evaluateNodeProperty(config.provider, config.providertype, node, msg),
                    realmName: RED.util.evaluateNodeProperty(config.realmName, config.realmNametype, node, msg),
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

    async function processInput(node, msg: RealmMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config, input: KeycloakConfig) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg, input)
        let payload = {};

        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });
        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                payload = await kcAdminClient.identityProviders.find();
            } else if (kcConfig.action === 'create') {

                try {
                    //@ts-ignore
                    if (msg.payload?.provider) {
                        //@ts-ignore
                        kcConfig.provider = mergeDeep(kcConfig.provider, msg.payload.provider)
                    }
                    payload = await kcAdminClient.identityProviders.findOne({ alias: kcConfig.provider.alias })
                    if (!payload) {
                        payload = await kcAdminClient.identityProviders.create(kcConfig.provider)
                        node.status({ shape: 'dot', fill: 'green', text: `${kcConfig.provider.displayName} created` })
                        nodelog({
                            debug,
                            action: "create",
                            message: "created",
                            item: kcConfig.provider, realm: kcConfig.realmName
                        })
                    } else {
                        payload = {
                            created: false
                        }
                        node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.provider.displayName} already exists` })
                        nodelog({
                            debug,
                            action: "create",
                            message: "already exists",
                            item: kcConfig.provider, realm: kcConfig.realmName
                        })
                    }
                } catch {
                    payload = {
                        created: false
                    }
                    node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.provider.displayName} already exists` })
                }
            } else if (kcConfig.action === 'getMappers') {
                payload = await kcAdminClient.identityProviders.findMappers({ alias: kcConfig.providermapper.alias });
            } else if (kcConfig.action === 'addMapper') {
                let identityProviderMappers = await kcAdminClient.identityProviders.findMappers({ alias: kcConfig.providermapper.alias });
                let exists = false;

                for (let identityProviderMapper of identityProviderMappers) {

                    if (identityProviderMapper.name === kcConfig.providermapper.identityProviderMapper.name) {
                        exists = true;
                    }
                }
                if (!exists) {
                    payload = await kcAdminClient.identityProviders.createMapper(kcConfig.providermapper)
                    node.status({ shape: 'dot', fill: 'green', text: `${kcConfig.providermapper.identityProviderMapper.name} created` })
                    nodelog({
                        debug,
                        action: "error",
                        message: "already exists", item: kcConfig.providermapper, realm: ''
                    })
                } else {
                    node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.providermapper.identityProviderMapper.name} already exists` })
                    nodelog({
                        debug,
                        action: "error",
                        message: "already exists", item: kcConfig.providermapper, realm: ''
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
            nodelog({
                debug,
                action: "error",
                message: err.message, item: err, realm: ''
            })
        }

        setTimeout(() => node.status({ text: `` }), 10000)
    }

    RED.nodes.registerType("keycloak-identity-providers", identityProviderNode);
}