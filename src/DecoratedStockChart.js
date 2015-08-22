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
                 * callback for when user remove a security entirely from the Chart
                 */
                onSecurityRemove: "&",
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
                /**
                 * keep track of directive states other than the scope
                 * these states are private to the directive
                 */
                const states = {
                    /**
                     * a map of which security has which attribute enabled
                     */
                    securityAttrMap: _.chain(scope.securities).map(function (security) {
                        return [security, [scope.defaultSecurityAttribute]];
                    }).object().value(),
                    /**
                     * to hold the Highstock object
                     */
                    chart: null
                };
                /**
                 * define the API exposed to the parent component
                 */
                scope.apiHandle.api = {
                    addSecurity: null, // TODO implement a handler for adding new securities
                    removeSecurity: null // TODO implement a handler for removing security
                };
            }
        };
    });