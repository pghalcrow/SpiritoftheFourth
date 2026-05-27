export const environment = {
  production: true,
  email: {
    url: "https://jybzxjzk2qq2y7pll4fh7pt3la0avfmx.lambda-url.us-west-2.on.aws/",
    fromEmail: "adm.spiritofthefourth@gmail.com"
  },
  stripe: {
    pk: "pk_live_51N6ITZCtYBFkGDnFjqlCYuxO0JKLaoNHBmq1I56Hde6k4QbSMqDk15NtZf6gyzi9Wnwem6K0zLpxO3D8Ypab6Qks00de6HVbgz"
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
    url: "https://rfgriyoxfaajhtdneqk7dbxuay0vdiir.lambda-url.us-west-2.on.aws"
  },
  forms: {
    carShow: {
      toEamil: "cowge41@gmail.com, tim@shinn.com",
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
    baseUrl: "https://yrm44mdntiug7uyzuf7tfsbsuy0poiai.lambda-url.us-west-2.on.aws",
    routes: {
      events: "/events",
      login: "/admin/login",
      adminEvents: "/admin/events",
      upload: "/admin/upload"
    }
  }
};