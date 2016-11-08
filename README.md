# DecoratedStockChart
Better Highstock, Enriched with a Bootstrap based Control

# Example Usage
HTML Template Sample Usage
```html
<decorated-stock-chart
        securities="securities"
        available-security-attributes="availableSecurityAttributes"
        default-security-attribute="defaultSecurityAttribute"
        on-attribute-select="onAttributeSelect(attr, security, options)"
        on-security-remove="onSecurityRemove(id)"

        highstock-options="highstockOptions"
        title="Example Chart of Stock Prices"
        show-market-indicators="true"
        show-benchmark="true"
        show-cdx-index="false"
        api-handle="apiHandle"

        market-index-typeahead="marketIndexTypeahead(userInput)"
        on-market-index-select="onMarketIndexSelect(attr, options)"

        custom-benchmark-options="customBenchmarkOptions"
        on-custom-benchmark-select="onCustomBenchmarkSelect(customBenchmark, options)"

        start-date="2014-01-01"
        end-date="2015-09-01">
</decorated-stock-chart>
```

JavaScript
```js

  /**
   * security related behavior
   */
  $scope.securities = [
      {id: 1, label: "T", mean: 0.08, stddev: 0.17, initPrice: 32},
      {id: 2, label: "VZ", mean: 0.05, stddev: 0.15, initPrice: 45},
      {id: 3, label: "GS", mean: 0.03, stddev: 0.23, initPrice: 184}];
  $scope.addSecurity = function (security) {
      $scope.apiHandle.api.addSecurity(security);
  };
  $scope.defaultSecurityAttribute = {tag: "price", label: "Price"};
  $scope.onSecurityRemove = function (id) {
      $scope.message = "Callback Fired: Security with ID = " + id + " was Removed!";
      $("#alert").slideDown(500);
  };
  $scope.availableSecurityAttributes = [{tag: "return", label: "Return"}, {
      tag: "price",
      label: "Price"
  }, {tag: "volume", label: "Volume"}];
  $scope.onAttributeSelect = function (attr, security, options) {
      return {
          name: security.label + " " + attr.label,
          data: simulate(domain(options), attr, security)
      };
  };

  /**
   * market index simulated behavior
   */
  $scope.marketIndexTypeahead = function (userInput) {
      const d = $q.defer();
      $timeout(function () {
          d.resolve([{tag: "snp_500", label: "S&P 500"}, {tag: "fin_cds", label: "Financial CDS"}]);
      }, 100);
      return d.promise;
  };
  $scope.onMarketIndexSelect = function (attr, options) {
      return {
          name: attr.label,
          data: simulate(domain(options), attr, {mean: 0.07, stddev: 0.13, initPrice: 100}, true)
      };
  };

  /**
   * custom benchmark simulated behavior
   */
  $scope.customBenchmarkOptions = {
      sectors: ['Sector A', 'Sector B'],
      wal: [1,3,5,7,10,30],
      ratings:['A','B','C'],
      analytics: [{tag: "price", label: "Price"}, {tag: "volume", label: "Volume"}, {tag: "return", label: "Return"}]
  };
  $scope.onCustomBenchmarkSelect = function (customBenchmark, options) {
      return {
          name: [customBenchmark.sector, customBenchmark.wal, customBenchmark.rating, customBenchmark.analytic.tag].join(" "),
          data: simulate(domain(options), customBenchmark.analytic, {mean: 0.07, stddev: 0.13, initPrice: 100}, true)
      };
  };

  $scope.apiHandle = {};

  $scope.closeAlert = function () {
      $("#alert").slideUp(500);
  };
```

# Options
| Option                      | Type                             | Expression Must Accept Argument                                      | Expression Must Produce                                         | Description                                                                                                                                                                                                                        |
|-----------------------------|----------------------------------|----------------------------------------------------------------------|-----------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| securities                  | `array of string`                |                                                                      |                                                                 | initial list of securities to query time series for                                                                                                                                                                                |
| startDate                   | `string`                         |                                                                      |                                                                 | initial start date for which to query time series data                                                                                                                                                                             |
| endDate                     | `string`                         |                                                                      |                                                                 | initial end date for which to query time series data                                                                                                                                                                               |
| availableSecurityAttributes | `array of object ~ {tag, label}` |                                                                      |                                                                 | a list of available security attributes that the user can choose from                                                                                                                                                              |
| defaultSecurityAttribute    | `object ~ {tag, label}`          |                                                                      |                                                                 | the default attribute to plot for newly added securities                                                                                                                                                                           |
| onAttributeSelect           | `expression`                     | `attr: ~ object {tag, label}`, `security: object`, `options: object` | `Highcharts.Series` or `promise` that resolves to `Highcharts.Series` | callback for when the user adds an attribute for a security expects a   Highchart.Series object in return                                                                                                                          |
| onSecurityRemove            | `expression`                     | `id - string`                                                        | `void`                                                            | callback for when user remove a security entirely from the Chart                                                                                                                                                                   |
| title                       | `string`                         |                                                                      |                                                                 | this is the chart title                                                                                                                                                                                                            |
| marketIndexTypeahead        | `expression`                     | `userInput: string`                                                  | `promise`                                                         | an expression that returns a promise, resolves to an array of market   index metadata objects. for example `{ label: xxx, tag: xxx }`                                                                                                |
| onMarketIndexSelect         | `expression`                     | `attr: object ~ {tag, label}`, `options: object`                     | `Highcharts.Series` or `promise` that resolves to `Highcharts.Series` | an expression that must return a promise that resolves to a   Highchart.Series object or returns a Highchart.Series object directly                                                                                                |
| customBenchmarkOptions      | `array of object`                |                                                                      |                                                                 | an object that contains a array typed property for each of the dimension   that a custom benchmark can be constructed on i.e. `[sector, wal, rating,   analytic] ex: {sectors: ['Sector A', 'Sector B', ...}, wal: [1,3,5,7], ... }]` |
| onCustomBenchmarkSelect     | `expression`                     | `customBenchmark: object`, `options: object`                        | `Highcharts.Series` or `promise` that resolves to `Highcharts.Series` | an expression that must return a promise that resolves to a   Highchart.Series object or returns a Highchart.Series object and must accept   an argument 'customBenchmark', 'options'                                              |
| highstockOptions            | `object`                         |                                                                      |                                                                 | options object for the underlying Highstock object                                                                                                                                                                                 |
| apiHandle                   | `object`                         |                                                                      |                                                                 | the API through which this directive exposes behavior to external   (parent) components this component's behavior can be accessed via   scope.apiHandle.api                                                                        |
| show-cdx-index              | `boolean`                        |                                                                      |                                                                 | To show comparison option or not

# API
| API   Method                    | Accept Argument               | Description                                                                          |
|---------------------------------|-------------------------------|--------------------------------------------------------------------------------------|
| api.addSecurity(security)       | `security: object`            | add a security                                                                       |
| api.removeSecurity(id)          | `id: string`                  | remove a security by ID                                                              |
| api.changeDateRange(start, end) | `start: string`, `end: string` | change the x axis range of the chart given string representations of   start and end |
