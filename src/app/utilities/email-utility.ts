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
  static adminSummaryRow(label: string, value: any): string {
    return this.volunteerSummaryRow(this.escapeHtml(label), value)
  }
  static emailLink(value: any): string {
    const email = this.escapeHtml(value)
    return `<a href="mailto:${email}" style="color: #1f5f9f; text-decoration: none; font-weight: 700;">${email}</a>`
  }
  static phoneLink(value: any): string {
    const phone = this.escapeHtml(value)
    const phoneHref = this.escapeHtml(String(value ?? "").replace(/\D/g, ''))
    return `<a href="tel:${phoneHref}" style="color: #1f5f9f; text-decoration: none; font-weight: 700;">${phone}</a>`
  }
  static formattedAddress(form: FormGroup): string {
    return [
      form.get("streetAddress")?.value,
      form.get("city")?.value,
      form.get("state")?.value,
      form.get("zipcode")?.value,
    ].filter(Boolean).join(", ").replace(", CA, ", ", CA ")
  }
  static normalizedEmail(title: string, eyebrow: string, intro: string, rows: Array<[string, any]>, footer: string): string {
    const rowHtml = rows
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([label, value]) => this.adminSummaryRow(label, value))
      .join("")

    return `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #f4f7fb; font-family: Georgia, 'Times New Roman', serif; color: #182536;">
    <div style="max-width: 680px; margin: 0 auto; padding: 28px 16px;">
      <div style="background: #ffffff; border: 1px solid #dce6f2; border-radius: 10px; overflow: hidden;">
        <div style="background: #102b46; padding: 24px 28px;">
          <div style="color: #f5c84c; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;">${this.escapeHtml(eyebrow)}</div>
          <h1 style="margin: 8px 0 0; color: #ffffff; font-size: 28px; line-height: 1.2;">${this.escapeHtml(title)}</h1>
        </div>
        <div style="padding: 24px 28px 8px;">
          <p style="margin: 0 0 18px; color: #526174; font-size: 16px; line-height: 1.55;">${this.escapeHtml(intro)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border: 1px solid #e7edf5; border-radius: 8px; overflow: hidden;">
            ${rowHtml}
          </table>
        </div>
        <div style="padding: 16px 28px 24px; color: #7b8797; font-size: 13px; line-height: 1.5;">${this.escapeHtml(footer)}</div>
      </div>
    </div>
  </body>
</html>`
  }
  static normalizedAdminEmail(title: string, eyebrow: string, intro: string, rows: Array<[string, any]>): string {
    return this.normalizedEmail(title, eyebrow, intro, rows, "Reply directly to this email to contact the submitter.")
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
    const rows: Array<[string, any]> = [
      ["VIP Name", this.escapeHtml(form.get("vipName")!.value)],
      ["Contact Name", this.escapeHtml(form.get("contactName")!.value)],
      ["Email", this.emailLink(form.get("email")!.value)],
      ["Phone", this.phoneLink(form.get("phone")!.value)],
      ["Address", this.escapeHtml(this.formattedAddress(form))],
      ["Parade Announcement", this.escapeHtml(form.get("paradeAnnouncement")!.value)],
      ["Providing Own Car", this.escapeHtml(form.get("vipOwnCar")!.value)],
    ]

    if (form.get("vipOwnCar")!.value == 'Yes') {
      rows.push(
        ["Driver Name", this.escapeHtml(form.get("driversName")!.value)],
        ["Driver Email", this.emailLink(form.get("driversEmail")!.value)],
        ["Driver Phone", this.phoneLink(form.get("driversPhone")!.value)],
        ["Car Details", this.escapeHtml(`${form.get("year")!.value} ${form.get("make")!.value} ${form.get("model")!.value}, ${form.get("color")!.value}`)]
      )
    }

    rows.push(["Signature Name", this.escapeHtml(form.get("signatureName")!.value)])

    return this.normalizedAdminEmail(
      "Parade VIP Entry Request",
      "New parade VIP entry",
      "A new VIP entry request was submitted from the Spirit of the Fourth website.",
      rows
    )
  }


  static createCarEntryHTMLBody(form: FormGroup) {
    return this.normalizedAdminEmail(
      "Parade Car Entry Request",
      "New parade car entry",
      "A new parade car entry request was submitted from the Spirit of the Fourth website.",
      [
        ["Contact Name", this.escapeHtml(form.get("contactName")!.value)],
        ["Email", this.emailLink(form.get("email")!.value)],
        ["Phone", this.phoneLink(form.get("phone")!.value)],
        ["Address", this.escapeHtml(this.formattedAddress(form))],
        ["Car Details", this.escapeHtml(`${form.get("year")!.value} ${form.get("make")!.value} ${form.get("model")!.value}, ${form.get("color")!.value}`)],
        ["Available VIP Seats", this.escapeHtml(form.get("availableSeats")!.value)],
        ["Special Information", this.escapeHtml(form.get("description")!.value)],
        ["Appreciation Gift", this.escapeHtml(form.get("wantGift")!.value)],
        ["Signature Name", this.escapeHtml(form.get("signatureName")!.value)],
      ]
    )
  }


  static createParadeEntryHTMLBody(paradeEntryForm: FormGroup): string {
    return this.normalizedAdminEmail(
      "Parade Entry Request",
      "New parade entry",
      "A new parade entry request was submitted from the Spirit of the Fourth website.",
      [
        ["Name of Entry", this.escapeHtml(paradeEntryForm.get("entryName")!.value)],
        ["Contact Name", this.escapeHtml(paradeEntryForm.get("contactName")!.value)],
        ["Email", this.emailLink(paradeEntryForm.get("email")!.value)],
        ["Phone", this.phoneLink(paradeEntryForm.get("phone")!.value)],
        ["Address", this.escapeHtml(this.formattedAddress(paradeEntryForm))],
        ["Description", this.escapeHtml(paradeEntryForm.get("description")!.value)],
        ["Parade Announcement", this.escapeHtml(paradeEntryForm.get("paradeAnnouncement")!.value)],
        ["Appreciation Gift", this.escapeHtml(paradeEntryForm.get("wantGift")!.value)],
        ["Entry Type", this.escapeHtml(paradeEntryForm.get("entryType")!.value)],
        ["Signature Name", this.escapeHtml(paradeEntryForm.get("signatureName")!.value)],
      ]
    )
  }
  static createSponsorshipHTMLBody(sponsorshipForm: FormGroup): string {
    const website = this.escapeHtml(sponsorshipForm.get("website")!.value)
    return this.normalizedAdminEmail(
      "Sponsorship Submission",
      "New sponsorship submission",
      "A new sponsorship submission was received from the Spirit of the Fourth website.",
      [
        ["Contact Name", this.escapeHtml(sponsorshipForm.get("contactName")!.value)],
        ["Contact Title", this.escapeHtml(sponsorshipForm.get("contactTitle")!.value)],
        ["Company", this.escapeHtml(sponsorshipForm.get("companyName")!.value)],
        ["Sponsorship Level", this.escapeHtml(sponsorshipForm.get("sponsorshipLevel")!.value)],
        ["Website", `<a target="_blank" href="${website}" style="color: #1f5f9f; text-decoration: none; font-weight: 700;">${website}</a>`],
        ["Email", this.emailLink(sponsorshipForm.get("email")!.value)],
        ["Phone", this.phoneLink(sponsorshipForm.get("phone")!.value)],
        ["Address", this.escapeHtml(this.formattedAddress(sponsorshipForm))],
      ]
    )
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

  static createMotorShowCheckConfirmationHTMLBody(details: {
    name: string;
    vehicle: string;
    shirtBundle: string;
    totalDue: number | string;
  }): string {
    const totalDue = typeof details.totalDue === "number"
      ? `$${details.totalDue.toFixed(2)}`
      : details.totalDue
    const mailTo = [
      this.escapeHtml("The Spirit of the Fourth"),
      this.escapeHtml("P.O. Box 270736"),
      this.escapeHtml("San Diego, CA 92198"),
    ].join("<br>")

    return this.normalizedEmail(
      "Wheels of Freedom Motor Show Entry Confirmation",
      "Pay by check confirmation",
      "Your entry has been received. Please mail your check by June 15 to the address below.",
      [
        ["Name", this.escapeHtml(details.name)],
        ["Vehicle", this.escapeHtml(details.vehicle)],
        ["T-Shirt & Plaque Bundle", this.escapeHtml(details.shirtBundle)],
        ["Total Due", this.escapeHtml(totalDue)],
        ["Mail Check To", mailTo],
      ],
      "Thank you for registering for the Wheels of Freedom Motor Show."
    )
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

    return this.normalizedAdminEmail(
      "Volunteer Request",
      "New volunteer signup",
      "A new volunteer request was submitted from the Spirit of the Fourth website.",
      []
    ).replace("</table>", `${rows}</table>`).replace("Reply directly to this email to contact the submitter.", "Reply directly to this email to contact the volunteer.")
  }

  static createArtistFormHTMLBody(artistForm: FormGroup): string {
    return this.normalizedAdminEmail(
      "Artist Sign-Up",
      "New artist sign-up",
      "A new artist sign-up was submitted from the Spirit of the Fourth website.",
      [
        ["Contact Name", this.escapeHtml(artistForm.get("contactName")!.value)],
        ["Organization", this.escapeHtml(artistForm.get("organizationName")?.value || "")],
        ["Email", this.emailLink(artistForm.get("email")!.value)],
        ["Phone", this.phoneLink(artistForm.get("phone")!.value)],
        ["Message", this.escapeHtml(artistForm.get("message")?.value || "").replace(/\n/g, "<br>")],
      ]
    )
  }
}
