
import { GrantTypes } from 'keycloak-admin/lib/utils/auth';
import { Node, NodeMessageInFlow } from 'node-red';
import ProtocolMapperRepresentation from 'keycloak-admin/lib/defs/protocolMapperRepresentation';
import ClientRepresentation from 'keycloak-admin/lib/defs/clientRepresentation';
import IdentityProviderRepresentation from 'keycloak-admin/lib/defs/identityProviderRepresentation';
import RealmRepresentation from 'keycloak-admin/lib/defs/realmRepresentation';
import ClientScopeRepresentation from 'keycloak-admin/lib/defs/clientScopeRepresentation';
import ComponentRepresentation from 'keycloak-admin/lib/defs/componentRepresentation';
import UserRepresentation from 'keycloak-admin/lib/defs/userRepresentation';

export interface IcalNode extends Node {
    config: any;
    red: any;
}

export function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

export function mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeDeep(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return mergeDeep(target, ...sources);
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
    id: string;
    client: ClientRepresentation;
    provider: IdentityProviderRepresentation;
    realm: RealmRepresentation
    scope: ClientScopeRepresentation
    protocolMapper: ProtocolMapperRepresentation;
    component: ComponentRepresentation,
    user: UserRepresentation
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

export interface ClientMessage extends NodeMessageInFlow {
    payload: {
        client: ClientRepresentation;
    }
}

export interface UserMessage extends NodeMessageInFlow {
    payload: {
        user: UserRepresentation;
    }
}