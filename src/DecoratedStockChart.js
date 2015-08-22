angular.module("DecoratedStockChart", [])
    .directive("DecoratedStockChart", function () {
        return {
            scope: {
                securities: "=",
                /**
                 * a list of available security attributes that the user can choose from
                 */
                availableSecurityAttributes: "=",
                defaultSecurityAttribute: "=",
                /**
                 * callback for when the user adds an attribute for a security
                 * expects a Highchart.Series object in return
                 */
                onAttributeSelect: "&",
                /**
                 * callback for when the user changes the primary attribute
                 * expects an Array of Highchart.Series objects each with securityId populated
                 * @param newAttr Object describing the new attribute
                 */
                onDefaultAttributeChange: "&",
                /**
                 * the API through which this directive exposes behavior to external (parent) components
                 * this component's behavior can be accessed via scope.apiHandle.api
                 */
                apiHandle: "="
            },
            link: function (scope, elem) {

            }
        };
    });