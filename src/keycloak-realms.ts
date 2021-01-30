
import { NodeMessageInFlow, NodeMessage } from "node-red";
import { KeycloakConfig } from "./helper";
import KcAdminClient from 'keycloak-admin';
import axios, { AxiosRequestConfig, Method } from 'axios';
import RealmRepresentation from "keycloak-admin/lib/defs/realmRepresentation";

export interface RealmMessage extends NodeMessageInFlow {
    payload: {
        execution_id: string;
        config: any;
    }
}

interface RealmPayload {
    realm?: RealmRepresentation,
    error?: any,
    created?: boolean,
    realms?: RealmRepresentation[]
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
            realm: node?.realmtype !== 'json' ? msg?.payload?.realm : JSON.parse(node?.realm)
        } as KeycloakConfig;

        return cloudConfig;
    }

    function eventsNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;
        node.action = config.action;
        node.realm = config.realm;
        node.realmtype = config.realmtype;

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

    async function processInput(node, msg: RealmMessage, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg)
        let payload: RealmPayload | any = {

        };

        if (!kcConfig.action || kcConfig.action === 'get') {
            payload.realms = await kcAdminClient.realms.find();
        }
        else if (kcConfig.action === 'create') {
            //@ts-ignore
            if (msg.payload?.realm) {
                //@ts-ignore
                kcConfig.realm = Object.assign(kcConfig.realm, msg.payload.realm)
            }
            try {
                let newRealm = await kcAdminClient.realms.create(kcConfig.realm)
                payload.realm = await kcAdminClient.realms.findOne({ realm: kcConfig.realm.realm });

            } catch (err) {
                payload = {
                    error: err,
                    created: false,

                }
                payload.realm = await kcAdminClient.realms.findOne({ realm: kcConfig.realm.realm });

            }
        } else if (kcConfig.action === 'getExecutions') {
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
                method: 'POST',
                data: msg.payload.config
            })

        }
        send({
            payload: payload,
            //@ts-ignore
            realm: kcConfig.realmName
        })
        if (done) done();
    }

    RED.nodes.registerType("keycloak-realms", eventsNode);
}