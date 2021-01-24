
import { GrantTypes } from 'keycloak-admin/lib/utils/auth';
import { Node } from 'node-red';
import ProtocolMapperRepresentation from 'keycloak-admin/lib/defs/protocolMapperRepresentation';


export interface IcalNode extends Node {

    config: any;
    red: any;

}

export interface KeycloakConfig {
    protocolMappers: ProtocolMapperRepresentation[];
    protocol: string;
    scopeName: string;
    name: string;

    baseUrl: string
    realmName: string

    username: string
    password: string
    grantType: GrantTypes
    clientId: string
    action: string

}

function deepen(obj) {
    const result = {};

    // For each object path (property key) in the object
    for (const objectPath in obj) {
        // Split path into component parts
        const parts = objectPath.split('.');

        // Create sub-objects along path as needed
        let target = result;
        while (parts.length > 1) {
            const part = parts.shift();
            target = target[part] = target[part] || {};
        }

        // Set value at end of path
        target[parts[0]] = obj[objectPath]
    }

    return result;
}



export function getConfig(config: any, node?: any, msg?: any): KeycloakConfig {


    const cloudConfig = {
        baseUrl: config?.baseUrl,
        realmName: node?.realmName || 'master',
        username: config?.credentials?.username,
        password: config?.credentials?.password,
        grantType: config?.grantType || 'password',
        clientId: config?.clientId || 'admin-cli',
        name: msg?.name || config?.name,
        action: msg?.action || node?.action || 'get'
    } as KeycloakConfig;

    return cloudConfig;
}





