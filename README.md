# azure-assign

Assign application roles to security groups for Azure Active Directory applications

## Scenario

- You have an Azure Active Directory (Azure AD) application and you have modified the application's manifest.json file by adding application roles.
- You also have created one or more security groups and have assigned your users to these groups according to their function.
- You now want to create a mapping between these security groups and your application roles.

## Problem

- You do not want to purchase Azure AD Premium.
- You have purchased Azure AD Premium but find out that you can assign a group to only one application role at a time.

## Solution

- Create a JSON file that maps groups to roles.
- Run `azure-assign` and pass it a JSON assignments file.

## Installation

Since this is a command-line utility, we recommend using the -g flag.

    npm install -g

You can also omit the -g flag. In that case, you must run it using the node command as described in the *Execution* section.

    npm install

## Configuration

Create a JSON file, let's call it `assignments.json`, that looks like this:

```json
{
    "tenant": "yourdomain.com",
    "credentials": {
        "clientId": "3cc99cdc-29ed-4002-b728-90c5251c2c9c",
        "clientSecret": "AB209sq3lksdj09384ljdfl03jkl8KJKHhklwei85ld="
    },
    "applications": [{
        "clientId": "3cc99cdc-29ed-4002-b728-90c5251c2c9c",
        "assignments": [{
            "groupId": "110634fa-aeb0-4c34-a1d5-9c9a1e211e37",
            "roles": ["reader"]
        }, {
            "groupId": "5f2a61db-f133-4979-87bb-5938924669a5",
            "roles": ["reader", "writer"]
        }, {
            "groupId": "7124217c-2c95-4ac5-809d-d7c868723ffb",
            "roles": ["reader", "writer", "admin"]
        }]
    }]
}
```

The tenant is the domain name of your Azure AD instance.

The credentials are the client ID and the secret application key for an Azure AD application that has been configured for directory reading and writing. (In this example, they are complely made-up values.) Note that is is quite likely that the application specified in the credentials and the application being configured are the same, as they are in this example.

The last block is an array of one or more applications. Each is identified by its client ID and contains an array of assignments that describe which groups are assigned to what roles *for that application*. The roles are specified using the `value` property in the `appRoles` section of the application's manifest.json file.

Note that we use the group ID, and not the display name as this can be easily changed in the Azure portal. You can add as many applications as you like. They can each have their group and role assignments. The groups and roles need not be the same for each application.

## Execution

If you installed this utility using the -g flag, simply run it from the command line:

    azure-assign assignments.json

If you did not use the -g flag, just run it using node:

    node azure-assign assignments.json

## Programmatic Interface

This module exports the assignment function that can be called from your program instead of running it from the command line.

```javascript
var assignRoles = require('azure-assign'),
    assignments = require('./assighments');

assignRoles(assignments, function (err, modifications) {
    if (err) {
        console.error(err.message);
    } else {
        console.dir(modifications);
    }
});
```

The modifications passed to the callback function is an arrary of objects that detail the additions and deletions made for each application.

## Advanced Topics

### Closed-World Assumption

This utility follows the [closed-world assumption](http://en.wikipedia.org/wiki/Closed-world_assumption) with respect to role assignments. Any current group assignment to an application is **removed** if it is not specified in the `assignments` stanza  of the configuration file. This is done for security. The assumption is that the assignments you've specified are the *only* assignments that you want. Anything else that was there before is to be removed.

### Idempotency

This utility can be executed multiple time and the assignments will not change. After running it the first time, you will see additions and deletions (if required). Running it again should result in no modifications (assuming another party has not modified your Azure AD instance between runs).

## License

(The MIT License)

Copyright (c) 2015 Frank Hellwig

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


