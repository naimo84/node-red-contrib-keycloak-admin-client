
import { NodeMessageInFlow, NodeMessage } from "node-red";
import { KeycloakConfig, mergeDeep, nodelog } from "./helper";
import KcAdminClient from 'keycloak-admin';
import axios, { AxiosRequestConfig, Method } from 'axios';
import RealmRepresentation from "keycloak-admin/lib/defs/realmRepresentation";
var debug = require('debug')('keycloak:realms')
export interface RealmMessage extends NodeMessageInFlow {
    payload: {
        execution_id: string;
        config: any;
        realm: any;
    }
}

interface RealmPayload {
    realm?: RealmRepresentation,
    error?: any,
    created?: boolean,
    realms?: RealmRepresentation[]
}

module.exports = function (RED: any) {

    function getConfig(config: any, node: any, msg: any, input: KeycloakConfig): KeycloakConfig {
        const nodeConfig = {
            baseUrl: config.useenv ? process.env[config.baseUrlEnv] : config.baseUrl,
            realmName: input?.realmName || 'master',
            username: config?.credentials?.username,
            password: config?.credentials?.password,
            grantType: config?.grantType || 'password',
            clientId: config?.clientId || msg?.clientId || 'admin-cli',
            name: msg?.name || config?.name,
            action: msg?.action || node?.action || 'get',
            client: node?.clienttype !== 'json' ? msg?.payload?.client : JSON.parse(node?.client),
            realm: input?.realm
        } as KeycloakConfig;

        return nodeConfig;
    }

    function realmNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.action = config.action;
        node.status({ text: `` })
        try {
            node.msg = {};
            node.on('input', (msg, send, done) => {
                let input: KeycloakConfig = {
                    realm: RED.util.evaluateNodeProperty(config.realm, config.realmtype, node, msg),
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
        let payload: RealmPayload | any = {

        };
        try {
            if (!kcConfig.action || kcConfig.action === 'get') {
                payload.realms = await kcAdminClient.realms.find();
            }
            else if (kcConfig.action === 'create') {
                //@ts-ignore
                if (kcConfig.realmName) {
                    //@ts-ignore
                    kcConfig.realm.realm = kcConfig.realmName;
                }

                try {
                    let oldRealm = await kcAdminClient.realms.findOne({ realm: kcConfig.realm.realm });
                    if (!oldRealm) {
                        if (msg?.payload?.realm) {
                            kcConfig.realm = mergeDeep(kcConfig.realm || {}, msg.payload.realm)
                        }
                        let newRealm = await kcAdminClient.realms.create(kcConfig.realm)
                        payload.realm = await kcAdminClient.realms.findOne({ realm: kcConfig.realm.realm });
                        node.status({ shape: 'dot', fill: 'green', text: `${kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm} created` })
                        nodelog({
                            debug,
                            action: "create",
                            message: "created",
                            item: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm, realm: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm
                        })
                    } else {
                        payload.realm = oldRealm;
                        node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm} already exists` })
                        nodelog({
                            debug,
                            action: "create",
                            message: "already exists",
                            item: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm, realm: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm

                        })
                    }
                } catch (err) {
                    payload.realm = await kcAdminClient.realms.findOne({ realm: kcConfig.realm.realm });
                    node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm} already exists` })
                    nodelog({
                        debug,
                        action: "create",
                        message: "already exists",
                        item: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm, realm: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm
                    })
                }
            }
            else if (kcConfig.action === 'update') {
                //@ts-ignore
                if (kcConfig.realmName) {
                    //@ts-ignore
                    kcConfig.realm.realm = kcConfig.realmName;
                }

                try {
                    await kcAdminClient.realms.update({ realm: kcConfig.realm.realm }, kcConfig.realm)
                    payload.realm = await kcAdminClient.realms.findOne({ realm: kcConfig.realm.realm });
                    node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm} already exists` })
                    nodelog({
                        debug,
                        action: "update",
                        message: "updated",
                        item: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm, realm: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm
                    })
                } catch (err) {
                    payload.realm = await kcAdminClient.realms.findOne({ realm: kcConfig.realm.realm });
                    node.status({ shape: 'dot', fill: 'yellow', text: `${kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm} already exists` })
                    nodelog({
                        debug,
                        action: "create",
                        message: "already exists",
                        item: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm, realm: kcConfig.realmName ? kcConfig.realmName : kcConfig.realm.realm
                    })
                }
            }
            else if (kcConfig.action === 'getExecutions') {
                kcAdminClient.setConfig({
                    realmName: kcConfig.realmName,
                });
                let executions = await kcAdminClient.authenticationManagement.getExecutions({ flow: 'browser' })
                payload = executions
            } else if (kcConfig.action === 'updateExecutionConfig') {
                let token = await kcAdminClient.getAccessToken()
                await axios({
                    baseURL: `${kcConfig.baseUrl}/admin/realms/${kcConfig.realmName}/authentication/executions/${msg.payload.execution_id}/config`,
                    headers: { 'Authorization': `Bearer ${token}` },
                    method: 'PUT',
                    data: msg.payload.config
                })
                node.status({ shape: 'dot', fill: 'green', text: `${msg.payload.execution_id} updated` })

            } else if (kcConfig.action === 'clearRealmCache') {
                let token = await kcAdminClient.getAccessToken()
                await axios({
                    baseURL: `${kcConfig.baseUrl}/admin/realms/${kcConfig.realmName}/clear-realm-cache`,
                    headers: { 'Authorization': `Bearer ${token}` },
                    method: 'POST'
                })
                node.status({ shape: 'dot', fill: 'green', text: `${kcConfig.realmName} clear-realm-cache` })
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

    RED.nodes.registerType("keycloak-realms", realmNode);
}