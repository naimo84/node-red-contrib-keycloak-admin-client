import KcAdminClient from 'keycloak-admin';


module.exports = function (RED: any) {
    function configNode(config) {
        RED.nodes.createNode(this, config);

        this.name = config.name;
        this.baseUrl = config.baseUrl;
        this.baseUrlEnv = config.baseUrlEnv;
        this.usernameEnv = config.usernameEnv;
        this.passwordEnv = config.passwordEnv;
        this.useenv = config.useenv;

        let node = this;
        node.getKcAdminClient = async (): Promise<KcAdminClient> => {        
            const kcAdminClient = new KcAdminClient({
                baseUrl: node.useenv ? process.env[node.baseUrlEnv] : node.baseUrl,
                realmName: 'master'
            });

            await kcAdminClient.auth({
                username: node.useenv ? process.env[node.usernameEnv] : node.credentials.username,
                password: node.useenv ? process.env[node.passwordEnv] : node.credentials.password,
                grantType: node.grantType || 'password',
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
