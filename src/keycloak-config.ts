import KcAdminClient from 'keycloak-admin';


module.exports = function (RED: any) {
    function configNode(config) {
        RED.nodes.createNode(this, config);

        this.name = config.name;
        this.baseUrl = config.baseUrl;

        let node = this;
        node.getKcAdminClient = async ():Promise<KcAdminClient> => {
            const kcAdminClient = new KcAdminClient({
                baseUrl: node.baseUrl,
                realmName: 'master'
            });

            await kcAdminClient.auth({
                username: node.credentials.username,
                password: node.credentials.password,
                grantType: node.grantType ||'password',
                clientId: node.clientId || 'admin-cli'
            });

            return kcAdminClient;
        };
    }

    RED.nodes.registerType('keycloak-config', configNode, {
        credentials: {
            password: { type: 'password' },
            username: { type: 'text' },

        }
    });
};
