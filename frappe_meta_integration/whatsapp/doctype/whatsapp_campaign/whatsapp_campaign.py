# Copyright (c) 2023, efeone Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json

class WhatsAppCampaign(Document):
    def validate(self):
        self.validate_recipients()

    def on_submit(self):
        self.validate_recipients()
        self.send_message()

    @frappe.whitelist()
    def validate_recipients(self):
        if self.recipients:
            for recipient in self.recipients:
                if not recipient.whatsapp_number:
                    frappe.throw("Recipient is required in Row {} to send messages".format(recipient.idx))
        else:
            frappe.throw("Recipient is required to send messages")

    @frappe.whitelist()
    def send_message(self):
        if self.recipients:
            created = 0
            for recipient in self.recipients:
                whatsapp_communication = frappe.new_doc('WhatsApp Communication')
                whatsapp_communication.to = recipient.whatsapp_number
                whatsapp_communication.message_type = self.message_type
                whatsapp_communication.message_body = self.message_body
                whatsapp_communication.media_filename = self.media_filename
                whatsapp_communication.media_caption = self.media_caption
                whatsapp_communication.media_file = self.media_file
                whatsapp_communication.media_image = self.media_image
                whatsapp_communication.whatsapp_message_template = self.whatsapp_message_template
                whatsapp_communication.parameters = self.parameters
                whatsapp_communication.reference_dt = self.doctype
                whatsapp_communication.reference_dn = self.name
                whatsapp_communication.save(ignore_permissions=True)
                whatsapp_communication.send_message()
                frappe.db.set_value('WhatsApp Campaign Recipient', recipient.name, 'whatsapp_communication', whatsapp_communication.name)
                frappe.db.set_value('WhatsApp Campaign Recipient', recipient.name, 'status', whatsapp_communication.status)
                created = 1
            if created:
                frappe.db.commit()
                frappe.msgprint("WhatsApp Communications created", alert=True, indicator="green")
                self.reload()
        else:
            frappe.throw("Recipient is required to send messages")

    @frappe.whitelist()
    def format_filters(self, filters):
        """Format filters to be compatible with frappe.get_all"""
        formatted_filters = []
        
        try:
            for f in filters:
                if isinstance(f, (list, tuple)) and len(f) >= 4:
                    doctype, field, operator, value = f[0], f[1], f[2], f[3]
                    
                    # Skip if field is empty
                    if not field:
                        continue
                    
                    # Handle special operators
                    if operator.lower() in ['in', 'not in']:
                        if isinstance(value, str):
                            value = [v.strip() for v in value.split(',') if v.strip()]
                    elif operator.lower() == 'between':
                        if isinstance(value, (list, tuple)) and len(value) == 2:
                            formatted_filters.append([field, '>=', value[0]])
                            formatted_filters.append([field, '<=', value[1]])
                            continue
                    
                    # Handle empty values
                    if value is None or value == '':
                        continue
                    
                    # For standard operators
                    formatted_filters.append([field, operator, value])
        
            return formatted_filters
        except Exception as e:
            frappe.log_error(f"Filter formatting error: {str(e)}", "WhatsApp Campaign Filter Error")
            return []
    
    
    @frappe.whitelist()
    def apply_filters_and_get_recipients(self, filters):
        """Apply filters and populate recipients table"""
        if not self.select_doctype:
            frappe.throw(("Please select a DocType first"))

        try:
            if not filters:
                frappe.throw(("No filters provided"))

            # Format the filters
            formatted_filters = self.format_filters(filters)
            frappe.log_error("formatted_filters", formatted_filters)

            if not formatted_filters:
                frappe.throw(("No valid filters found after formatting"))

            # Initialize an empty set for tracking unique phone numbers
            seen_phones = set()

            # Get the mapping of fields for whatsapp_number and person_name
            doctype_meta = frappe.get_meta(self.select_doctype)

            # Get records based on doctype
            records = []
            if doctype_meta.name.strip() == 'Lead':
                records = frappe.db.get_list(
                    "Lead",
                    filters=formatted_filters,
                    fields=["first_name", "mobile_no"]
                )

            elif doctype_meta.name == 'Opportunity':
                records = frappe.db.get_list(
                    "Opportunity",
                    filters=formatted_filters,
                    fields=["customer_name", "contact_mobile"]
                )
            elif doctype_meta.name == 'Contact':
                records = frappe.db.get_list(
                    "Contact",
                    filters=formatted_filters,
                    fields=["customer_name", "phone", "mobile_no"]
                )
            elif doctype_meta.name == 'Customer':
                records = frappe.db.get_list(
                    "Customer",
                    filters=formatted_filters,
                    fields=["customer_name", "mobile_no"]
                )

            recipients = [] 
            recipient_data = {}
            for record in records:
                # Get phone and name based on doctype
                if doctype_meta.name == 'Contact':
                    phone = record.mobile_no or record.phone
                    name = record.customer_name
                elif doctype_meta.name == 'Lead':
                    phone = record.mobile_no
                    name = record.first_name
                elif doctype_meta.name == 'Opportunity':
                    phone = record.contact_mobile
                    name = record.customer_name
                elif doctype_meta.name == 'Customer':
                    phone = record.mobile_no
                    name = record.customer_name

                if phone:
                    phone = str(phone).strip()
                    # Add '91' prefix if not present
                    if len(phone) >= 10 and not phone.startswith('91'):
                        phone = '91' + phone

                    # Check if phone number is unique in current batch
                    if phone not in seen_phones and len(phone) >= 12:  # 12 digits (91 + 10 digit number)
                        recipients.append({
                            'whatsapp_number': phone,
                            'person_name': name or 'Unknown'
                        })
                        recipient_data[phone] = name or 'Unknown'
                        seen_phones.add(phone)
                        frappe.log_error(f"Added new phone: {phone}", seen_phones)

            if not recipients:
                frappe.msgprint(("No new recipients found with the current filters"))
            self.recipient_data = json.dumps(recipient_data)
            
            frappe.log_error("Final recipients list", recipients)
            return recipients

        except Exception as e:
            frappe.throw(("Error applying filters: {0}").format(str(e)))
        
    def validate_campaign_settings(self):
        """Validate the campaign settings"""
        if not self.select_doctype:
            frappe.throw(("Please select a DocType for filtering recipients"))
            
        if not self.recipients:
            frappe.throw(("Recipients table cannot be empty. Please apply filters to populate recipients."))
            
        # Validate recipient phone numbers
        for recipient in self.recipients:
            if not recipient.whatsapp_number:
                frappe.throw(("WhatsApp number is required for all recipients"))
            if len(str(recipient.whatsapp_number).strip()) < 10:
                frappe.throw(("Invalid WhatsApp number for recipient: {0}").format(recipient.person_name or "Unknown"))
                
                
                
def get_campaign_status_counts(reference_dn):
    status_types = [
        "pending", "read", "received", "sent", 
        "label", "delivered", "marked_as_seen", "failed"
    ]
    
    return {
        status: frappe.db.count(
            "WhatsApp Communication",
            filters={
                "reference_dn": reference_dn,
                "status": status,
            }
        ) for status in status_types
    }

def get_html_content(status, count):
    """
    Generate HTML content for status display
    """
    status_colors = {
        "pending": "#FFA500",      # Orange
        "read": "#28a745",         # Green
        "received": "#007bff",     # Blue
        "sent": "#17a2b8",         # Cyan
        "label": "#6c757d",        # Gray
        "delivered": "#28a745",    # Green
        "marked_as_seen": "#28a745", # Green
        "failed": "#dc3545"        # Red
    }
    
    return f"""
    <div style="padding: 10px; border-radius: 5px; background-color: {status_colors.get(status, '#6c757d')}; color: white; text-align: center;">
        <div style="font-size: 24px; font-weight: bold;">{count}</div>
        <div style="text-transform: uppercase; font-size: 12px;">{status.replace('_', ' ')}</div>
    </div>
    """

def update_campaign_counts(doc, method=None):

    if not doc.reference_dn:
        return
        
    try:
        # Get all status counts for this campaign
        status_counts = get_campaign_status_counts(doc.reference_dn)
        
        # Get and update the campaign document
        campaign = frappe.get_doc("WhatsApp Campaign", doc.reference_dn)
        
        # Update each status HTML field
        for status, count in status_counts.items():
            html_content = get_html_content(status, count)
            campaign.set(status, html_content)
        
        # Save the document
        campaign.save(ignore_permissions=True)
        frappe.db.commit()
        
    except Exception as e:
        frappe.log_error(f"Error updating WhatsApp Campaign counts: {str(e)}")
