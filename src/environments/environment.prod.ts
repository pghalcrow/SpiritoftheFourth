export const environment = {
  production: true,
  email: {
    url: "https://z2l2bnbbsh2i2oa37bhgvooyhe0wbegl.lambda-url.us-west-2.on.aws/",
    fromEmail: "adm.spiritofthefourth@gmail.com"
  },
  stripe: {
    pk: "pk_test_51N6ITZCtYBFkGDnFnqxO5njTXiRYsHAx8UQ4E9jxmIl392iDU6FLSu9wFpXQ09PvT9ACFjbBwtyfj2WjIxUgyTbZ006rnkZaql"
  },
  paypal: {
    donationEnv: "production",
    donationHostedButtonId: "ERLZZZF5H4NSN"
  },
  products: {
    motorShowShirtAndPlaque: {
      small: "https://www.paypal.com/ncp/payment/88CF6Y9GXDLDJ",
      medium: "https://www.paypal.com/ncp/payment/9ZG6QPBXJCWSY",
      large: "https://www.paypal.com/ncp/payment/BG43FVVPNTFNS",
      xlarge: "https://www.paypal.com/ncp/payment/QAEDC3C7RB2EG",
      xxlarge: "https://www.paypal.com/ncp/payment/ZYEE3S2Y32ULC",
      xxxlarge: "https://www.paypal.com/ncp/payment/4TQC7FU3YQRHC",
    }
  },
  order: {
    url: "https://gnvdtq24qvk7gmzz3qq64aufei0piqrx.lambda-url.us-west-2.on.aws"
  },
  forms: {
    carShow: {
      toEamil: "pghalcrow@gmail.com",
      subject: "New Car Show Entry Request"
    },
    volunteerForm: {
      toEamil: "dave.spiritofthefourth@gmail.com, joelsurfdog@redshift.com",
      subject: "New Volunteer Request"
    },
    sponsorshipForm: {
      toEamil: "treasurer.spiritofthefourth@gmail.com",
      subject: "New Sponsorship Submission"
    },
    vendorApplicationForm: {
      toEamil: " marla.spiritofthefourth@gmail.com",
      subject: "New Vendor Application Submission"
    },
    artistSignUpForm: {
      toEamil: "laura.barish@gmail.com , lynn.spiritofthefourth@gmail.com",
      subject: "New Artist Sign-Up"
    },
    paradeEntryForm: {
      toEamil: "RBparadeSOTF@hotmail.com",
      subject: "New Parade Entry Request - Parade"
    },
    carEntryForm: {
      toEamil: "RBparadeSOTF@hotmail.com",
      subject: "New Parade Entry Request - Car"
    },
    vipEntryForm: {
      toEamil: "RBparadeSOTF@hotmail.com",
      subject: "New Parade Entry Request - VIP"
    },
  },
  cms: {
    baseUrl: "https://fb6ob2hp7em6vh2tpmr5iuy4am0jrqpd.lambda-url.us-west-2.on.aws",
    assetBaseUrl: "",
    routes: {
      events: "/events",
      login: "/admin/login",
      adminEvents: "/admin/events",
      submissions: "/admin/submissions",
      upload: "/admin/upload"
    }
  }
};
