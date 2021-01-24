
import { NodeMessageInFlow, NodeMessage } from "node-red";
import { getConfig } from "./helper";
import KcAdminClient from 'keycloak-admin';
import axios, { AxiosRequestConfig, Method } from 'axios';

export interface RealmMessage extends NodeMessageInFlow {
    payload: {
        execution_id: string;
        config: any;
    }
}

module.exports = function (RED: any) {

    function eventsNode(config: any) {
        RED.nodes.createNode(this, config);
        let node = this;
        node.realmName = config.realmName;

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
        let payload = {};

        if (!kcConfig.action || kcConfig.action === 'get') {
            payload = await kcAdminClient.realms.find();
        }
        else if (kcConfig.action === 'create') {
            let createKeycloakUrl = 'https://account.example.de/auth'
            let clientSecret = '123'
            let newRealm = await kcAdminClient.realms.create({
                id: 'testnb',
                displayName: 'TestNB',
                enabled: true,
                realm: 'testNb',
                identityProviders: [
                    {
                        displayName: "example",
                        enabled: true,
                        alias: "example",
                        trustEmail: true,
                        storeToken: true,
                        addReadTokenRoleOnCreate: true,
                        providerId: "keycloak-oidc",
                        config: {
                            clientId: "example-identitybrokering",
                            clientSecret: clientSecret,
                            prompt: "login",
                            authorizationUrl: createKeycloakUrl + "/realms/example/protocol/openid-connect/auth",
                            tokenUrl: createKeycloakUrl + "/realms/example/protocol/openid-connect/token",
                            logoutUrl: createKeycloakUrl + "/realms/example/protocol/openid-connect/logout",
                            userInfoUrl: createKeycloakUrl + "/realms/example/protocol/openid-connect/userinfo",
                            validateSignature: "true",
                            uiLocales: "true",
                            jwksUrl: createKeycloakUrl + "/realms/example/protocol/openid-connect/certs",
                            issuer: createKeycloakUrl + "/realms/example",
                            useJwksUrl: "true",
                            loginHint: "true",
                            clientAuthMethod: "client_secret_post",
                            backchannelSupported: "true",
                        }
                    }
                ]
            })
            payload = newRealm;
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
            payload: payload
        })
        if (done) done();
    }

    RED.nodes.registerType("keycloak-realms", eventsNode);
}