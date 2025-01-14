const mockApi = {
  branding: {
    default: {
      endpoint: "branding/",
      query: "",
      data: {
        name: "Shady Meadows B&B",
        map: {
          latitude: 52.6351204,
          longitude: 1.2733774,
        },
        logoUrl: "/images/rbp-logo.jpg",
        description:
          "Welcome to Shady Meadows, a delightful Bed & Breakfast nestled in the hills on Newingtonfordburyshire. A place so beautiful you will never want to leave. All our rooms have comfortable beds and we provide breakfast from the locally sourced supermarket. It is a delightful place.",
        contact: {
          name: "Shady Meadows B&B",
          address:
            "The Old Farmhouse, Shady Street, Newfordburyshire, NE1 410S",
          phone: "012345678901",
          email: "fake@fakeemail.com",
        },
      },
    },
  },
  room: {
    default: {
      endpoint: "room/",
      query: "",
      data: {
        rooms: [
          {
            roomid: 1,
            roomName: "101",
            type: "single",
            accessible: true,
            image: "/images/room2.jpg",
            description:
              "Aenean porttitor mauris sit amet lacinia molestie. In posuere accumsan aliquet. Maecenas sit amet nisl massa. Interdum et malesuada fames ac ante.",
            features: ["TV", "WiFi", "Safe"],
            roomPrice: 100,
          },
        ],
      },
    },
  },
};

const mockApiPresets = {
  default: [mockApi["branding"].default, mockApi["room"].default],
};

export { mockApi, mockApiPresets };
