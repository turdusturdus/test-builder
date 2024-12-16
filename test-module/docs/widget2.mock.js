const mockApi = {
  endpoint3: {
    default: {
      endpoint: "endpoint3",
      query: "?offset=0&limit=1000&sort=name&dir=asc&arg1=A",
      data: {
        data: [
          {
            price_change_pct: -0.552486188,
            dt: "2023-11-24",
            trading_code: "PLZBMZC00019",
            name: "ZREMB",
            ticker: "ZRE",
            quotation_type: "NOTC",
            time: "124401",
            price_open: 3.615,
            price_low: 3.585,
            price_high: 3.72,
            price_reference: 3.62,
            price_last: 3.6,
            cumulative_volume: 9174,
            cumulative_value: 33424.76,
            price_change: -0.02,
          },
          {
            price_change_pct: -2.077151335,
            dt: "2023-11-24",
            trading_code: "PLZUE0000015",
            name: "ZUE",
            ticker: "ZUE",
            quotation_type: "NOTC",
            time: "123701",
            price_open: 6.7,
            price_low: 6.5,
            price_high: 6.7,
            price_reference: 6.74,
            price_last: 6.6,
            cumulative_volume: 8390,
            cumulative_value: 54917.58,
            price_change: -0.14,
          },
        ],
        count: 2,
      },
    },
  },
  "endpoint4/subendpoint1": {
    default: {
      endpoint: "endpoint4/subendpoint1",
      query: "?arg2=PLZAPUL00057&arg3=12&arg4=2021-03-06",
      data: { dividend: 79.2 },
    },
  },
};

const mockApiPresets = {
  e2e: {
    default: [
      mockApi["endpoint3"].default,
      mockApi["endpoint4/subendpoint1"].default,
    ],
  },
};

export { mockApi, mockApiPresets };
