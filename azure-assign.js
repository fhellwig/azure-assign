#!/usr/bin/env node

var path = require('path'),
    async = require('async'),
    GraphAPI = require('azure-graphapi');

var graph;

function assign(config, callback) {
    graph = new GraphAPI(config.tenant,
        config.credentials.clientId, config.credentials.clientSecret);

    async.waterfall([
        function (callback) {
            getAppDescriptors(config.applications, callback);
        },
        addAssignedRoles,
        function (descriptors, callback) {
            var modifications = [];
            descriptors.forEach(function (descriptor) {
                modifications.push(determineModification(descriptor));
            });
            async.each(modifications, function (m, callback) {
                async.parallel([
                    function (callback) {
                        async.each(m.additions, function (a, callback) {
                            var request = {
                                resourceId: m.resourceId,
                                principalId: a.group.groupId,
                                principalType: 'Group',
                                id: a.role.roleId
                            };
                            graph.post('groups/{principalId}/appRoleAssignments', request, request, callback);
                        }, callback);
                    },
                    function (callback) {
                        async.each(m.deletions, function (d, callback) {
                            graph.delete('groups/{group.groupId}/appRoleAssignments/{role.assignmentId}', d, callback);
                        }, callback);
                    }
                ], callback);
            }, function (err) {
                callback(err, modifications);
            });
        }
    ], callback);
}

// Calls the callback function with an array of app descriptor projects.
// Each object has the following properties:
//
//  clientId: the application id
//  displayName: the application display name
//  resourceId: the service prinical's id
//  roles: the application roles as an object mapping role values to ids
//  assignments: an object mapping each group id to an array of role ids
function getAppDescriptors(applications, callback) {
    var lookup = {}; // temporary map of client ids to service principals
    graph.get('servicePrincipals', function (err, res) {
        if (err) return callback(err);
        // With the lookup, we can find service principals by client id.
        res.forEach(function (sp) {
            lookup[sp.appId] = sp;
        });
        // For each application, create the application descriptor.
        async.map(applications, function (app, callback) {
            sp = lookup[app.clientId]; // find the service principal
            createAppDescriptor(app, sp, callback);
        }, callback);
    });
}

// Creates an application descriptor from an app configuration object and a
// service principal.
function createAppDescriptor(app, sp, callback) {
    var roleIds = {}; // map role values to role ids
    var roleValues = {}; // map role ids to role values
    sp.appRoles.forEach(function (role) {
        roleIds[role.value] = role.id;
        roleValues[role.id] = role.value;
    });
    async.map(app.assignments, function (ga, callback) {
        graph.get('groups/{groupId}', ga, function (err, group) {
            if (err) return callback(err);
            var roles = ga.roles.map(function (role) {
                var roleId = roleIds[role];
                if (roleId) {
                    return {
                        roleId: roleId,
                        roleValue: role
                    };
                } else {
                    callback(new Error(role + ': No such role in ' + sp.displayName));
                }
            });
            callback(null, {
                groupId: group.objectId,
                groupDisplayName: group.displayName,
                roles: roles
            });
        });
    }, function (err, assignments) {
        callback(err, {
            clientId: sp.appId,
            displayName: sp.displayName,
            resourceId: sp.objectId,
            roles: roleValues,
            assignments: {
                required: assignments
            }
        });
    });
}

// Populates each descriptor object with a current assignment map as
// returned from the getAssignedRoles() function. The descriptors
// are provided to the callback function.
function addAssignedRoles(descriptors, callback) {
    async.each(descriptors, function (descriptor, callback) {
        getAssignedRoles(descriptor, function (err, assignments) {
            if (err) return callback(err);
            descriptor.assignments.assigned = assignments;
            callback(null);
        });
    }, function (err) {
        callback(err, descriptors);
    });
}

// Get the current group assignments.
function getAssignedRoles(descriptor, callback) {
    graph.get('servicePrincipals/{resourceId}/appRoleAssignedTo', descriptor, function (err, res) {
        if (err) return callback(err);
        var byGroupId = {};
        res.forEach(function (item) {
            if (item.objectType === 'AppRoleAssignment' && item.principalType === 'Group') {
                var assignments = byGroupId[item.principalId];
                if (!assignments) {
                    assignments = {
                        groupId: item.principalId,
                        groupDisplayName: item.principalDisplayName,
                        roles: []
                    };
                    byGroupId[item.principalId] = assignments;
                }
                assignments.roles.push({
                    roleId: item.id,
                    roleValue: descriptor.roles[item.id],
                    assignmentId: item.objectId
                });
            }
        });
        var assignments = Object.keys(byGroupId).map(function (groupId) {
            return byGroupId[groupId];
        });
        callback(null, assignments);
    });
}

// Determine the additions and deletions for the application.
function determineModification(descriptor) {
    var additions = [],
        deletions = [],
        assignments = descriptor.assignments;
    groupsToAdd = difference(assignments.required, assignments.assigned, 'groupId'),
        groupsToDelete = difference(assignments.assigned, assignments.required, 'groupId'),
        groupsToProcess = intersection(assignments.required, assignments.assigned, 'groupId');

    groupsToAdd.forEach(function (group) {
        group.roles.forEach(function (role) {
            additions.push({
                group: {
                    groupId: group.groupId,
                    groupDisplayName: group.groupDisplayName
                },
                role: role
            });
        });
    });
    groupsToDelete.forEach(function (group) {
        group.roles.forEach(function (role) {
            deletions.push({
                group: {
                    groupId: group.groupId,
                    groupDisplayName: group.groupDisplayName
                },
                role: role
            });
        });
    });
    groupsToProcess.forEach(function (pair) {
        rolesToAdd = difference(pair[0].roles, pair[1].roles, 'roleId');
        rolesToDelete = difference(pair[1].roles, pair[0].roles, 'roleId');
        rolesToAdd.forEach(function (role) {
            additions.push({
                group: {
                    groupId: pair[0].groupId,
                    groupDisplayName: pair[0].groupDisplayName
                },
                role: role
            });
        });
        rolesToDelete.forEach(function (role) {
            deletions.push({
                group: {
                    groupId: pair[1].groupId,
                    groupDisplayName: pair[1].groupDisplayName
                },
                role: role
            });
        });
    });
    var modification = {
        displayName: descriptor.displayName,
        resourceId: descriptor.resourceId,
        additions: additions,
        deletions: deletions
    }
    return modification;
}

// Given two arrays (a) and (b), return (a) \ (b), or more formally, all items
// in (a) that are not in (b). The optional function is called as (x, y) where
// each is an element from each set. It returns true if x equals y by whatever
// means the function determines equality. The default function uses ==.
function difference(a, b, fn) {
    fn = makeEqualsFunction(fn);
    return a.filter(function (x) {
        return b.every(function (y) {
            return !fn(x, y);
        });
    });
}

// Given two arrays (a) and (b), return (a) ∩ (b), or more formally, all items
// in (a) that are also in (b). The optional function is called as (x, y) where
// each is an element from each set. It returns true if x equals y by whatever
// means the function determines equality. The default function uses ==. The
// return value is an array of arrays, each having a length of two. Pairs are
// returned because, although equal, the may be different objects.
function intersection(a, b, fn) {
    fn = makeEqualsFunction(fn);
    var pairs = [];
    for (var i = 0, m = a.length; i < m; i++) {
        for (var j = 0, n = b.length; j < n; j++) {
            if (fn(a[i], b[j])) {
                pairs.push([a[i], b[j]]);
                break;
            }
        }
    }
    return pairs;
}

// Creates the equality function used by difference and intersection.
function makeEqualsFunction(fn) {
    if (typeof fn === 'function') {
        return fn;
    }
    if (typeof fn === 'string') {
        var key = fn;
        return function (x, y) {
            return x[key] == y[key];
        };
    }
    return function (x, y) {
        return x == y;
    };
}

function printModifications(modifications) {
    modifications.forEach(function (m) {
        if (m.additions.length === 0 && m.deletions.length === 0) {
            console.log("No modifications required for the '%s' application.", m.displayName);
        } else {
            m.additions.forEach(function (a) {
                console.log("Assigning the '%s' role to the '%s' group for the '%s' application.",
                    a.role.roleValue, a.group.groupDisplayName, m.displayName);
            });
            m.deletions.forEach(function (d) {
                console.log("Removing the '%s' role from the '%s' group for the '%s' application.",
                    d.role.roleValue, d.group.groupDisplayName, m.displayName);
            });
        }
    });
}

function readConfigFile(filename) {
    var pathname = path.resolve(filename);
    try {
        return require(pathname);
    } catch (e) {
        if (e.code && e.code === 'MODULE_NOT_FOUND') {
            console.error("Cannot find '%s'", pathname);
        } else if (e instanceof SyntaxError) {
            console.error(e.message);
        } else {
            throw e;
        }
        process.exit(1);
    }
}

function main() {
    var filename = process.argv[2];
    if (filename) {
        var config = readConfigFile(filename);
        assign(config, function (err, modifications) {
            if (err) {
                console.error(err.message);
            } else {
                printModifications(modifications);
            }
        });
    } else {
        console.error('Usage: %s <filename>', path.basename(process.argv[1]));
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = assign;

