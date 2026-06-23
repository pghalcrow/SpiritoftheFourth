export const environment = {
  production: false,
  email: {
    url: "http://localhost:5001",
  },
  stripe: {
    pk: "pk_test_51N6ITZCtYBFkGDnFnqxO5njTXiRYsHAx8UQ4E9jxmIl392iDU6FLSu9wFpXQ09PvT9ACFjbBwtyfj2WjIxUgyTbZ006rnkZaql"
  },
  paypal: {
    donationEnv: "sandbox",
    donationHostedButtonId: ""
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
    url: "http://localhost:5001"
  },
  forms: {
    carShow: {
      toEamil: "natahlie@gearboxwebsites.com",
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
    freedomClubDonation: {
      toEamil: "dave.spiritofthefourth@gmail.com",
      subject: "Freedom Club Donation"
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
    baseUrl: "http://localhost:5001",
    assetBaseUrl: "",
    routes: {
      events: "/events",
      login: "/admin/login",
      adminEvents: "/admin/events",
      submissions: "/admin/submissions",
      upload: "/admin/upload",
      testMode: "/admin/test-mode",
      adminUsers: "/admin/users",
      passwordReset: "/admin/password-reset",
      passwordResetConfirm: "/admin/password-reset/confirm",
      newPassword: "/admin/new-password"
    }
  }
};
