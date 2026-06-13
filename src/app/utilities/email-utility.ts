import { FormGroup } from "@angular/forms"

export class EmailUtlity {
  static htmlBegin = "<!doctype html><html><body>"
  static htmlEnd = "</body></html>"

  static makeField(header: string, values: string[]): string {
    let content = "<div><b>" + header + ": </b></div><p>"
    values.forEach(value => {
      content += value + " "
    })
    content += "</p><br/>"
    return content
  }
  static makeFieldLink(header: string, value: string): string {
    let content = "<div><b>" + header + ": </b></div><p><a target=\"_blank\" href=\"" + value + "\" >" + value + "</a></p><br/>"
    return content
  }
  static makePhoneLink(header: string, value: string): string {
    let content = "<div><b>" + header + ": </b></div><p><a href=\"tel:" + value.replace(/\D/g, '') + "\" >" + value + "</a></p><br/>"
    return content
  }
  static escapeHtml(value: any): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  }
  static volunteerSummaryRow(label: string, value: any): string {
    return `
      <tr>
        <td style="padding: 12px 14px; border-bottom: 1px solid #e7edf5; color: #526174; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; width: 34%;">${label}</td>
        <td style="padding: 12px 14px; border-bottom: 1px solid #e7edf5; color: #182536; font-size: 15px; line-height: 1.45;">${value}</td>
      </tr>`
  }

  static createVendorApplicationHTMLBody(vendorApplicationForm: FormGroup): string {
    let contentString = ""

    contentString += this.makeField("Vendor Status", [vendorApplicationForm.get("vendorStatus")!.value])
    contentString += this.makeField("Vendor Type", [vendorApplicationForm.get("vendorType")!.value])
    contentString += this.makeField("Company Name", [vendorApplicationForm.get("companyName")!.value])
    contentString += this.makeField("Contact", [vendorApplicationForm.get("contactName")!.value])
    contentString += this.makeField("Email", [vendorApplicationForm.get("email")!.value])
    contentString += this.makePhoneLink("Phone", vendorApplicationForm.get("phone")!.value)
    contentString += this.makeField("Address", [vendorApplicationForm.get("streetAddress")!.value, vendorApplicationForm.get("city")!.value + ",", vendorApplicationForm.get("state")!.value, vendorApplicationForm.get("zipcode")!.value])
    contentString += this.makeFieldLink("Website", vendorApplicationForm.get("website")!.value)
    contentString += this.makeField("Description", [vendorApplicationForm.get("description")!.value])
    contentString += this.makeField("Special Requests", [vendorApplicationForm.get("specialRequests")?.value || ""]);
    contentString += this.makeField("Signature Name", [vendorApplicationForm.get("signatureName")!.value])

    return contentString
  }

  static createVIPEntryHTMLBody(form: FormGroup) {
    let contentString = ""

    contentString += this.makeField("VIP Name", [form.get("vipName")!.value])


    contentString += this.makeField("Contact Name", [form.get("contactName")!.value])
    contentString += this.makeField("Email", [form.get("email")!.value])
    contentString += this.makePhoneLink("Phone", form.get("phone")!.value)
    contentString += this.makeField("Address", [form.get("streetAddress")!.value, form.get("city")!.value + ",", form.get("state")!.value, form.get("zipcode")!.value])

    contentString += this.makeField("Parade Announcement", [form.get("paradeAnnouncement")!.value])
    contentString += this.makeField("Providing Own Car", [form.get("vipOwnCar")!.value])

    if (form.get("vipOwnCar")!.value == 'Yes') {
      contentString += this.makeField("Drivers Name", [form.get("driversName")!.value])
      contentString += this.makeField("Drivers Email", [form.get("driversEmail")!.value])
      contentString += this.makePhoneLink("Drivers Phone", form.get("driversPhone")!.value)
      contentString += this.makeField("Car Details", [form.get("year")!.value, form.get("make")!.value, form.get("model")!.value + ",", form.get("color")!.value])
    }

    contentString += this.makePhoneLink("Consenters Name", form.get("signatureName")!.value)

    return this.htmlBegin + contentString + this.htmlEnd
  }


  static createCarEntryHTMLBody(form: FormGroup) {
    let contentString = ""

    contentString += this.makeField("Contact Name", [form.get("contactName")!.value])
    contentString += this.makeField("Email", [form.get("email")!.value])
    contentString += this.makePhoneLink("Phone", form.get("phone")!.value)
    contentString += this.makeField("Address", [form.get("streetAddress")!.value, form.get("city")!.value + ",", form.get("state")!.value, form.get("zipcode")!.value])

    contentString += this.makeField("Car Details", [form.get("year")!.value, form.get("make")!.value, form.get("model")!.value + ",", form.get("color")!.value])
    contentString += this.makeField("Available VIP Seats", [form.get("availableSeats")!.value])
    contentString += this.makeField("Special Information", [form.get("description")!.value])
    contentString += this.makePhoneLink("Appreciation Gift?", form.get("wantGift")!.value)

    contentString += this.makePhoneLink("Consenters Name", form.get("signatureName")!.value)


    return this.htmlBegin + contentString + this.htmlEnd
  }


  static createParadeEntryHTMLBody(paradeEntryForm: FormGroup): string {
    let contentString = ""

    contentString += this.makeField("Name of Entry", [paradeEntryForm.get("entryName")!.value])

    contentString += this.makeField("Contact Name", [paradeEntryForm.get("contactName")!.value])
    contentString += this.makeField("Email", [paradeEntryForm.get("email")!.value])
    contentString += this.makePhoneLink("Phone", paradeEntryForm.get("phone")!.value)
    contentString += this.makeField("Address", [paradeEntryForm.get("streetAddress")!.value, paradeEntryForm.get("city")!.value + ",", paradeEntryForm.get("state")!.value, paradeEntryForm.get("zipcode")!.value])

    contentString += this.makeField("Description", [paradeEntryForm.get("description")!.value])
    contentString += this.makeField("Parade Announcement", [paradeEntryForm.get("paradeAnnouncement")!.value])
    contentString += this.makePhoneLink("Appreciation Gift?", paradeEntryForm.get("wantGift")!.value)
    contentString += this.makePhoneLink("Entry Type", paradeEntryForm.get("entryType")!.value)

    contentString += this.makePhoneLink("Consenters Name", paradeEntryForm.get("signatureName")!.value)

    return this.htmlBegin + contentString + this.htmlEnd
  }
  static createSponsorshipHTMLBody(sponsorshipForm: FormGroup): string {

    let contentString = ""

    contentString += this.makeField("Contact Name", [sponsorshipForm.get("contactName")!.value])
    contentString += this.makeField("Contact Title", [sponsorshipForm.get("contactTitle")!.value])
    contentString += this.makeField("Company", [sponsorshipForm.get("companyName")!.value])
    contentString += this.makeFieldLink("Website", sponsorshipForm.get("website")!.value)
    contentString += this.makeField("Email", [sponsorshipForm.get("email")!.value])
    contentString += this.makePhoneLink("Phone", sponsorshipForm.get("phone")!.value)
    contentString += this.makeField("Address", [sponsorshipForm.get("streetAddress")!.value, sponsorshipForm.get("city")!.value + ",", sponsorshipForm.get("state")!.value, sponsorshipForm.get("zipcode")!.value])

    return this.htmlBegin + contentString + this.htmlEnd
  }

  static createCarShowHTMLBody(carShowForm: FormGroup): string {

    let contentString = ""

    contentString += this.makeField("First Name", [carShowForm.get("firstName")!.value])
    contentString += this.makeField("Last Name", [carShowForm.get("lastName")!.value])
    contentString += this.makeField("Email", [carShowForm.get("email")!.value])
    contentString += this.makePhoneLink("Phone", carShowForm.get("phone")!.value)
    contentString += this.makeField("Address", [carShowForm.get("streetAddress")!.value, carShowForm.get("city")!.value + ",", carShowForm.get("state")!.value, carShowForm.get("zipcode")!.value])
    contentString += this.makeField("Car Details", [carShowForm.get("year")!.value, carShowForm.get("make")!.value, carShowForm.get("model")!.value + ",", carShowForm.get("color")!.value])
    if (carShowForm.get("clubAffiliation")?.value) {
      contentString += this.makeField("Club Affiliation", [carShowForm.get("clubAffiliation")!.value])
    }

    return this.htmlBegin + contentString + this.htmlEnd
  }

  static createVolunteerFormHTMLBody(volunteerForm: FormGroup): string {
    const contactName = this.escapeHtml(volunteerForm.get("contactName")!.value)
    const organizationName = this.escapeHtml(volunteerForm.get("organizationName")?.value)
    const email = this.escapeHtml(volunteerForm.get("email")!.value)
    const phone = this.escapeHtml(volunteerForm.get("phone")!.value)
    const phoneHref = this.escapeHtml(volunteerForm.get("phone")!.value.replace(/\D/g, ''))
    const availability = this.escapeHtml(volunteerForm.get("availability")!.value)
    const message = this.escapeHtml(volunteerForm.get("message")!.value).replace(/\n/g, "<br>")

    let rows = ""
    rows += this.volunteerSummaryRow("Contact", contactName)
    if (organizationName) {
      rows += this.volunteerSummaryRow("Organization", organizationName)
    }
    rows += this.volunteerSummaryRow("Email", `<a href="mailto:${email}" style="color: #1f5f9f; text-decoration: none; font-weight: 700;">${email}</a>`)
    rows += this.volunteerSummaryRow("Phone", `<a href="tel:${phoneHref}" style="color: #1f5f9f; text-decoration: none; font-weight: 700;">${phone}</a>`)
    rows += this.volunteerSummaryRow("Availability", availability)
    rows += this.volunteerSummaryRow("Message", message)

    return `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #f4f7fb; font-family: Georgia, 'Times New Roman', serif; color: #182536;">
    <div style="max-width: 680px; margin: 0 auto; padding: 28px 16px;">
      <div style="background: #ffffff; border: 1px solid #dce6f2; border-radius: 10px; overflow: hidden;">
        <div style="background: #102b46; padding: 24px 28px;">
          <div style="color: #f5c84c; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">New volunteer signup</div>
          <h1 style="margin: 8px 0 0; color: #ffffff; font-size: 28px; line-height: 1.2;">Volunteer Request</h1>
        </div>
        <div style="padding: 24px 28px 8px;">
          <p style="margin: 0 0 18px; color: #526174; font-size: 16px; line-height: 1.55;">A new volunteer request was submitted from the Spirit of the Fourth website.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border: 1px solid #e7edf5; border-radius: 8px; overflow: hidden;">
            ${rows}
          </table>
        </div>
        <div style="padding: 16px 28px 24px; color: #7b8797; font-size: 13px; line-height: 1.5;">Reply directly to this email to contact the volunteer.</div>
      </div>
    </div>
  </body>
</html>`
  }

  static createArtistFormHTMLBody(artistForm: FormGroup): string {
    let contentString = "";

    contentString += this.makeField("Contact Name", [artistForm.get("contactName")!.value]);

    if (artistForm.get("organizationName")?.value) {
      contentString += this.makeField("Organization", [artistForm.get("organizationName")!.value]);
    }

    contentString += this.makeField("Email", [artistForm.get("email")!.value]);
    contentString += this.makePhoneLink("Phone", artistForm.get("phone")!.value);
    contentString += this.makeField("Message", [artistForm.get("message")?.value || ""]);

    return this.htmlBegin + contentString + this.htmlEnd;
  }
}
