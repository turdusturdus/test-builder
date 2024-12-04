const mockApi = {
  endpoint1: {
    default: {
      endpoint: "endpoint1",
      query: "?arg1=WS0447",
      data: [
        {
          market_id: "243",
          market_type: "REG",
          market_segment: "GLD",
        },
        {
          market_id: "243",
          market_type: "REG",
          market_segment: "TCS",
        },
        {
          market_id: "986",
          market_type: "REG",
          market_segment: "GLD",
        },
      ],
    },
  },
  endpoint2: {
    default: {
      endpoint: "endpoint2",
      query: "?arg1=WS0447&arg2=243",
      data: {
        unitid: 57645,
        market_id: "243",
        market_type: "REG",
        price: 81,
        t_fee: 0.19,
        b_fee: 0.0019,
        dt: "2023-09-27",
        dt_p: "2023-09-29",
        ytm: 5.443428800163289,
        ytm_net: 4.43664208472428,
        dur: 14.447695491763398,
        mdur: 13.701845298624301,
        conv: 266.613606879059,
        bpv: 0.11333597392638,
        type: "TB-XC-PO",
      },
    },
    noData: {
      endpoint: "endpoint2",
      query: "?arg1=WS0447&arg2=243",
      data: {},
    },
  },
};

const mockApiPresets = {
  e2e: {
    default: [mockApi["endpoint1"].default, mockApi["endpoint2"].default],
    noData: [mockApi["endpoint1"].default, mockApi["endpoint2"].noData],
  },
  unit: {
    default: [mockApi["endpoint1"].default, mockApi["endpoint2"].default],
  },
};

export { mockApi, mockApiPresets };
