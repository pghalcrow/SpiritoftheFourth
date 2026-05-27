export const environment = {
  production: false,
  email: {
    url: "https://hpocmu4d7tyabnwak3eofvrav40mkkpr.lambda-url.us-west-2.on.aws/",
  },
  stripe: {
    pk: "pk_test_51N6ITZCtYBFkGDnFnqxO5njTXiRYsHAx8UQ4E9jxmIl392iDU6FLSu9wFpXQ09PvT9ACFjbBwtyfj2WjIxUgyTbZ006rnkZaql"
  },
  products: {
    motorShowShirtAndPlaque: {
      small: "https://buy.stripe.com/test_3csaIndB3c7G1k46oo",
      medium: "https://buy.stripe.com/test_7sIcQv40t7Rq0g0001",
      large: "https://buy.stripe.com/test_00g5o3cwZ2x66EocMO",
      xlarge: "https://buy.stripe.com/test_6oEeYD54xc7G6Eo28b",
      xxlarge: "https://buy.stripe.com/test_eVadUz40tgnW0g0eUY",
      xxxlarge: "https://buy.stripe.com/test_6oEeYDfJb6Nm2o8005"
    }
  },
  order: {
    url: "https://thhezemtlm7jnvllelcy765x7y0pzfzg.lambda-url.us-west-2.on.aws" // "http://localhost:3000/hello" 
  },
  forms: {
    carShow: {
      toEamil: "cal.code.97@gmail.com",
      subject: "New Car Show Entry Request"
    },
    volunteerForm: {
      toEamil: "cal.code.97@gmail.com",
      subject: "New Volunteer Request"
    },
    sponsorshipForm: {
      toEamil: "mykejonez53@gmail.com",
      subject: "New Sponsorship Submission"
    },
    vendorApplicationForm: {
      toEamil: "mykejonez53@gmail.com",
      subject: "New Vendor Application Submission"
    },
    artistSignUpForm: {
      toEamil: "cal.code.97@gmail.com",
      subject: "New Artist Sign-Up"
    },
    paradeEntryForm: {
      toEamil: "mykejonez53@gmail.com",
      subject: "New Parade Entry Request - Parade"
    },
    carEntryForm: {
      toEamil: "cal.code.97@gmail.com",
      subject: "New Parade Entry Request - Car"
    },
    vipEntryForm: {
      toEamil: "mykejonez53@gmail.com",
      subject: "New Parade Entry Request - VIP"
    },
  },
  cms: {
    baseUrl: "https://pld6ie63oxozbkbotx3i2geo6i0trwks.lambda-url.us-west-2.on.aws",
    routes: {
      events: "/events",
      login: "/admin/login",
      adminEvents: "/admin/events",
      upload: "/admin/upload"
    }
  }
};