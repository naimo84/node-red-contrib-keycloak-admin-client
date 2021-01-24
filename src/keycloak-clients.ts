
import { NodeMessageInFlow, NodeMessage } from "node-red";
import { getConfig } from "./helper";
import KcAdminClient from 'keycloak-admin';

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

    async function processInput(node, msg: NodeMessageInFlow, send: (msg: NodeMessage | NodeMessage[]) => void, done: (err?: Error) => void, config) {
        let configNode = RED.nodes.getNode(config);
        let kcAdminClient = await configNode.getKcAdminClient() as KcAdminClient;
        let kcConfig = getConfig(configNode, node, msg)
        kcAdminClient.setConfig({
            realmName: kcConfig.realmName,
        });
        const clients = await kcAdminClient.clients.find();

        send({
            payload: clients
        })
        if (done) done();
    }

    RED.nodes.registerType("keycloak-clients", eventsNode);
}