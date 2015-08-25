# DecoratedStockChart
Better Highstock, Enriched with a Bootstrap based Control

# Example Usage
HTML Template Sample Usage
```html
<decorated-stock-chart securities="securities"
                       default-security-attribute="defaultSecurityAttribute"
                       available-security-attributes="availableSecurityAttributes"
                       on-attribute-select="onAttributeSelect(attr, security)"
                       highstock-options="highstockOptions"
                       on-security-remove="onSecurityRemove(id)"
                       title="Example Chart of Stock Prices"
                       api-handle="apiHandle">
</decorated-stock-chart>
```

JavaScript
```js
$scope.securities = [{id: 1, label: "T"}, {id: 2, label: "VZ"}, {id: 3, label: "GS"}];
$scope.defaultSecurityAttribute = {tag: "price", label: "Price"};
$scope.availableSecurityAttributes = [{tag: "price", label: "Price"}, {tag: "volume", label: "Volume"}];
$scope.onAttributeSelect = function (attr, security) {
    return {
        name: security.label + " " + attr.label,
        data: generateRandomPairs(domain(), [0, 1000])
    };
};
$scope.onSecurityRemove = function (id) {
    $scope.message = "Callback Fired: Security with ID = " + id + " was Removed!";
    $("#alert").slideDown(500);
};
$scope.closeAlert = function () {
    $("#alert").slideUp(500);
};
$scope.apiHandle = {};
// demo functions
$scope.addSecurity = function (security) {
    $scope.apiHandle.api.addSecurity(security);
};
```

# Options
| Name | Type     | Description |
| :------------- | :------------- | :----------- |
| TODO       |        |  | |

# API
| Name | Type    | Description |
| :------------- | :------------- | :----------- |
| TODO       |       |    | |

# Credit
