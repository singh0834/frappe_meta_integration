# Copyright (c) 2023, efeone Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

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
            frappe.throw(_("Please select a DocType first"))
    
        try:
            if not filters:
                frappe.throw(_("No filters provided"))
            
            # Format the filters
            formatted_filters = self.format_filters(filters)
            frappe.log_error("formatted_filters", formatted_filters)
        
            if not formatted_filters:
                frappe.throw(_("No valid filters found after formatting"))
                
            existing_numbers = {r.whatsapp_number for r in self.recipients}
        
            # Get the mapping of fields for whatsapp_number and person_name
            doctype_meta = frappe.get_meta(self.select_doctype)
            frappe.log_error("doctype_meta", doctype_meta)
            frappe.log_error("doctype_meta.name", doctype_meta.name)
        
            # Get records based on doctype
            records = []
            if doctype_meta.name.strip() == 'Lead':
                frappe.log_error("i am here")
                records = frappe.db.get_list(
                    "Lead",
                    filters=formatted_filters,
                    fields=["first_name", "mobile_no"]
                )
                
                frappe.log_error("records for lead", records)
                
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
	        
         
            seen_phones = set()
            recipients = []
            for record in records:
                # For Contact doctype, check both phone and mobile_no
                if doctype_meta.name == 'Contact':
                    phone = record.mobile_no or record.phone
                    name = record.customer_name
                # For Lead
                elif doctype_meta.name == 'Lead':
                    phone = record.primary_mobile
                    name = record.first_name
                    
                    frappe.log_error("phone is", phone)
                    frappe.log_error("name is", name)
                    
                # For Opportunity
                elif doctype_meta.name == 'Opportunity':
                    phone = record.contact_mobile
                    name = record.customer_name
                # For Customer
                elif doctype_meta.name == 'Customer':
                    phone = record.mobile_no
                    name = record.customer_name
                    
                    frappe.log_error("phone is", phone)
                    frappe.log_error("name is", name)
                
                if phone:
                    phone = str(phone).strip()
                    if len(phone) >= 10 and phone not in seen_phones: # Minimum length check
                        if not phone.startswith('91'):
                            phone = '91' + phone
                        recipients.append({
                            'whatsapp_number': phone,
                            'person_name': name or 'Unknown'
                        })
                        
                        existing_numbers.add(phone)
                        
            if not recipients:
                frappe.msgprint(_("No new recipients found with the current filters"))
            
            frappe.log_error("recipients for lead", recipients)
            return recipients

        except Exception as e:
            frappe.log_error(
                msg=f"Error applying filters for {self.select_doctype}: {str(e)}\nFilters: {filters}",
                title="WhatsApp Campaign Filter Error"
            )
            frappe.throw(_("Error applying filters: {0}").format(str(e)))

    def validate_campaign_settings(self):
        """Validate the campaign settings"""
        if not self.select_doctype:
            frappe.throw(_("Please select a DocType for filtering recipients"))
            
        if not self.recipients:
            frappe.throw(_("Recipients table cannot be empty. Please apply filters to populate recipients."))
            
        # Validate recipient phone numbers
        for recipient in self.recipients:
            if not recipient.whatsapp_number:
                frappe.throw(_("WhatsApp number is required for all recipients"))
            if len(str(recipient.whatsapp_number).strip()) < 10:
                frappe.throw(_("Invalid WhatsApp number for recipient: {0}").format(recipient.person_name or "Unknown"))
