
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

        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });

        if (!kcConfig.action || kcConfig.action === 'get') {
            payload = await kcAdminClient.clientScopes.find();
        } else if(kcConfig.action==='create'){
            await kcAdminClient.clientScopes.create({
                realm:kcConfig.realmName,
                protocol:kcConfig.protocol,
                name:kcConfig.scopeName,
                protocolMappers:kcConfig.protocolMappers
            })
        }
      
        send({
            payload: payload
        })
        if (done) done();
    }

    RED.nodes.registerType("keycloak-client-scopes", eventsNode);
}