# Copyright (c) 2022, efeone Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
import requests
import mimetypes
import json
from typing import Dict
from six import string_types

from frappe.model.document import Document

def process_template_parameter(template = None, template_parameter = None):
	if template_parameter:
		template_parameter = json.loads(template_parameter)
	items = []
	if template:
		template_doc = frappe.get_doc("WhatsApp Message MSG91", template)
		for row in template_doc.parameter:
			temp = {}
			temp["parameter"] = row.get("field_name")
			temp["location"] = row.get("location")
			temp["subtype"] = row.get("subtype")
			temp["type"] = row.get("type")
			temp["value"] = template_parameter.get(row.get("field_name"))
			items.append(temp)
	return items
class WhatsAppCommunication(Document):
	def validate(self):
		self.validate_image_attachment()
		self.validate_mandatory()
		self.validate_template()

		if self.message_type == "Audio" and self.media_file:
			self.preview_html = f"""
				<audio controls>
					<source src="{self.media_file}" type="{self.media_mime_type}">
					Your browser does not support the audio element.
				</audio>
			"""

		if self.message_type == "Video" and self.media_file:
			self.preview_html = f"""
				<video controls>
					<source src="{self.media_file}" type="{self.media_mime_type}">
					Your browser does not support the video element.
				</video>
			"""

	def validate_image_attachment(self):
		if self.media_image:
			self.media_file = self.media_image
		if self.media_file and self.message_type == "Image":
			self.media_image = self.media_file

	# For setting up whether the msg type is txt or template.
	def validate_mandatory(self):
		if self.message_type == "Text" and not self.message_body:
			frappe.throw("Message Body is required for type Text.")
		if self.message_type == "Template" and not self.whatsapp_message_template:
			frappe.throw("Message Template is required for type Template.")

	# Check validation parameter need to check how it is working.
	def validate_parameters(self):
		if self.message_type == "Template":
			for parameter in self.parameters:
				if not parameter.value:
					frappe.throw('Parameter Value is Missing for <b>{0}</b> at row : <b>{1}</b>.'.format(parameter.parameter, parameter.idx))

	# Need to check
	def validate_template(self):
		if self.message_type == "Template":
			if self.parameter_count:
				if self.parameter_count != len(self.parameters):
					frappe.throw("Parameter count and given number of parameters doesn't match!")

	def get_access_token(self):
		return frappe.utils.password.get_decrypted_password(
			"WhatsApp Cloud API Settings", "WhatsApp Cloud API Settings", "access_token"
		)

	# Check whether header is present or not
	def validate_header_media(self):
		if self.message_type == "Template" and self.whatsapp_message_template:
			if self.header_has_media:
				if not self.header_media:
					frappe.throw("`header_media` is required in selected Template.")

	
	# Method to use whatsapp msg**

	@frappe.whitelist()
	def send_message(self):
		if not self.to:
			frappe.throw("Recepient (`to`) is required to send message.")

		access_token = self.get_access_token()

		api_base_url = "https://control.msg91.com"
		endpoint = "/api/v5/whatsapp/whatsapp-outbound-message/bulk/"
		phone_number_id = frappe.db.get_single_value("WhatsApp Cloud API Settings", "phone_number_id")
		# Forget about endpoint we will procced it through the method defined in msg91
		endpoint = f"{api_base_url}/{phone_number_id}/messages"

		response_data = {
			"integrated_number": "",  # Replace with your WhatsApp number
			"content_type": "template",
			"payload": {
				"type": "template",
				"template": {
					"name": self.whatsapp_message_template,  # Template name from Wati
					"language": {
						"code": self.template_language,  # Language code
						"policy": "deterministic"
					},
					"to_and_components": []
				},
				"messaging_product": "whatsapp"
			}
		}

		# response_data = {
		# 	"messaging_product": "whatsapp",
		# 	"recipient_type": "individual",
		# 	"to": self.to,
		# 	"type": self.message_type.lower(),
		# }

		if self.message_type == "Text":
			response_data["text"] = {"preview_url": False, "body": self.message_body}

		if self.message_type in ("Audio", "Image", "Video", "Document"):
			if not self.media_id:
				frappe.throw("Please attach and upload the media before sending this message.")

			response_data[self.message_type.lower()] = {
				"id": self.media_id,
			}

			if self.message_type == "Image":
				response_data[self.message_type.lower()]["caption"] = self.media_caption

			if self.message_type == "Document":
				response_data[self.message_type.lower()]["filename"] = self.media_filename
				response_data[self.message_type.lower()]["caption"] = self.media_caption
		# Designed the payload reuired while sending the message template.
		if self.message_type == "Template":
			self.validate_parameters()
			self.validate_header_media()
			# Body Parameter
			body_parameters = []
			body_parameters = [{"type": "text", "value": param.value} for param in self.parameters]
			body_components = {}
			for i, param in enumerate(body_parameters, 1):
				body_components[f"body_{i}"] = param

			# Button Parameter
			button_parameters = []
			if self.button_url_text:
				button_parameters.append({
					"subtype": "url",  # Define subtype for button type (url)
					"type": "text",  # Type is text for the button
					"value": self.button_url_text  # Button URL text
				})
			button_components = {}
			for i, button in enumerate(button_parameters, 1):  # Start indexing from 1
				button_components[f"button_{i}"] = button

			if self.header_has_media:
				if self.header_media:
					media_file_path = frappe.utils.get_url()
					media_file_path += self.header_media
					headers_parameters = []
					if self.media_type == 'image':
						headers_parameters.append({
							"type": "image",
							"image": {
								"link": media_file_path
							}
						})
					if self.media_type == 'document':
						headers_parameters.append({
							"type": "document",
							"document": {
								"link": media_file_path
							}
						})
					if self.media_type == 'video':
						headers_parameters.append({
							"type": "video",
							"video": {
								"link": media_file_path
							}
						})
					header_component = {
						"header_1": {
							"type": self.media_type,  # 'image', 'video', 'document'
							"value": media_file_path
						}
					}
				components_dict = {
					**header_component,
					**body_components,  
					**button_components 
				}
			else:
				components_dict = {
					**body_components,
					**button_components
				}
			response_data["template"] = {"name": self.whatsapp_message_template, "language": { "code": self.template_language }, "components":components_dict }

		response = requests.post(
			endpoint,
			json=response_data,
			headers={
				"Authorization": "Bearer " + access_token,
				"Content-Type": "application/json",
			},
		)

		if response.ok:
			self.message_id = response.json().get("messages")[0]["id"]
			self.status = "Sent"
			self.save(ignore_permissions=True)
			if self.is_welcome_message:
				frappe.msgprint(("Welcome Message sent to {0} ").format(self.to), alert=True, indicator="green")
			else:
				if self.message_type not in ("Audio", "Image", "Video", "Document"):
					frappe.msgprint(("WhatsApp Message sent to {0} ").format(self.to), alert=True, indicator="green")
				else:
					frappe.msgprint(("Attachment sent to {0} ").format(self.to), alert=True, indicator="green")
			return response.json()
		else:
			frappe.throw(response.json().get("error").get("message"))

	@classmethod
	def send_whatsapp_message(self, receiver_list, message, template, doctype, docname, template_parameter = None, media=None, file_name=None):
		if isinstance(receiver_list, string_types):
			if not isinstance(receiver_list, list):
				receiver_list = [receiver_list]

		for rec in receiver_list:
			"""
			Iterate receiver_list and send message to each recepient
			"""
			self.create_whatsapp_message(rec, message, template, doctype, docname, template_parameter) #For Text Message or Caption for documents
			if media and file_name:
				self.create_whatsapp_message(rec, message, template, doctype, docname, template_parameter, media, file_name) #For Document


	def create_whatsapp_message(to, message, template=None, doctype=None, docname=None, template_parameter = None, media=None, file_name=None):
		"""
		Create WhatsApp Communication with given data.
		"""
		template_items = process_template_parameter(template, template_parameter)
		frappe.log_error("log", template_items)
		wa_msg = frappe.get_doc({
			"doctype": "WhatsApp Communication",
			"to": to,
			"reference_dt": doctype,
			"whatsapp_message_template": template,
			"reference_dn": docname,
			"message_type": "Template",
			"parameters": template_items,
			"message_body" : message
		})
		wa_msg.insert(ignore_permissions = 1)
		# wa_msg = frappe.get_doc('WhatsApp Communication')
		# wa_msg.to = to
		# wa_msg.reference_dt = doctype
		# wa_msg.whatsapp_message_template = template
		# wa_msg.reference_dn = docname
		# if media:
		# 	wa_msg.message_type = "Document"
		# 	wa_msg.media_filename = file_name
		# 	wa_msg.media_file = media
		# else:
		# 	wa_msg.message_type = "Template"
		# 	wa_msg.parameters = template_items
		# 	wa_msg.message_body = message
		# wa_msg.insert(ignore_permissions=True)
		# if media and file_name:
			# wa_msg.upload_media() #Upload Attachment
		# wa_msg.send_message() #Send Attachment/Text Message

			
     
	def get_media_url(self):
		if not self.media_id:
			frappe.throw("`media_id` is missing.")

		api_base = "https://graph.facebook.com/v13.0"
		access_token = self.get_access_token()
		response = requests.get(
			f"{api_base}/{self.media_id}",
			headers={
				"Authorization": "Bearer " + access_token,
			},
		)

		if not response.ok:
			frappe.throw("Error fetching media URL")

		return response.json().get("url")

	@frappe.whitelist()
	def download_media(self) -> Dict:
		url = self.get_media_url()
		access_token = self.get_access_token()
		response = requests.get(
			url,
			headers={
				"Authorization": "Bearer " + access_token,
			},
		)

		file_name = get_media_extention(self, response.headers.get("Content-Type"))
		file_doc = frappe.get_doc(
			{
				"doctype": "File",
				"file_name": file_name,
				"content": response.content,
				"attached_to_doctype": "WhatsApp Communication",
				"attached_to_name": self.name,
				"attached_to_field": "media_file",
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()

		self.set("media_file", file_doc.file_url)

		# Will be used to display image preview
		if self.message_type == "Image":
			self.set("media_image", file_doc.file_url)

		self.save()

		return file_doc.as_dict()

# Webhook to use update the message details
@frappe.whitelist()
def update_message_status(status: Dict):
	''' Method to updtae status of Message '''
	message_id = status.get("id")
	status = status.get("status")

	if frappe.db.exists('WhatsApp Communication', {"message_id": message_id}):
		frappe.db.set_value(
			"WhatsApp Communication", {"message_id": message_id}, "status", status.title()
		)
		frappe.db.commit()

@frappe.whitelist()
def create_incoming_whatsapp_message(message: Dict):
	''' Method to create Incoming messages via webhook '''
	MEDIA_TYPES = ("image", "sticker", "document", "audio", "video")
	message_type = message.get("type")
	message_data = frappe._dict(
		{
			"doctype": "WhatsApp Communication",
			"type": "Incoming",
			"status": "Received",
			"from_no": message.get("from"),
			"message_id": message.get("id"),
			"message_type": message_type.title(),
		}
	)

	if message_type == "text":
		message_data["message_body"] = message.get("text").get("body")
	elif message_type in MEDIA_TYPES:
		message_data["media_id"] = message.get(message_type).get("id")
		message_data["media_mime_type"] = message.get(message_type).get("mime_type")
		message_data["media_hash"] = message.get(message_type).get("sha256")

	if message_type == "document":
		message_data["media_filename"] = message.get("document").get("filename")
		message_data["media_caption"] = message.get("document").get("caption")

	if message_type == "image" or message_type == "video":
		message_data["media_caption"] = message.get(message_type).get("caption")

	message_doc = frappe.get_doc(message_data).insert(ignore_permissions=True)
	frappe.db.commit()

def get_media_extention(message_doc, content_type):
	return message_doc.media_filename or (
		"attachment_." + content_type.split(";")[0].split("/")[1]
	)



# import http.client
# import frappe
# import json

# @frappe.whitelist(allow_guest=True)
# def send_whatsapp_message(template_name, parameters, to_number):
#     # Fetch the template details from Frappe
#     template_data = get_template_data(template_name)
    
#     if not template_data:
#         frappe.throw("Template not found!")
    
#     # Prepare the payload
#     payload = prepare_payload(template_data, parameters, to_number)

#     # Send the WhatsApp message using MSG91 API
#     send_message_via_api(payload)

#     return "Message sent successfully"

# def get_template_data(template_name):
#     """Fetch template data from the Frappe database."""
#     # Query the 'Template' doctype to get the template by name
#     template_record = frappe.get_all('Template', filters={'template_name': template_name}, fields=["template_name", "namespace", "category", "language_code", "template", "parameters"])
    
#     if not template_record:
#         return None  # No template found

#     template_record = template_record[0]

#     # Return the template data
#     return template_record

# def prepare_payload(template_data, parameters, to_number):
#     """Prepare the payload to send the message."""
#     template_name = template_data['template_name']
#     language_code = template_data['language_code']
    
#     # Prepare the components based on the template and parameters
#     components = []
    
#     # Iterate over the parameters and map them to the template fields
#     for param in parameters:
#         param_field_name = param.get("field_name")
#         param_value = param.get("value")
#         location = param.get("location")

#         component = {
#             "to": [to_number],
#             "components": {}
#         }
        
#         # Based on location (header, body, button) fill the components
#         if location == "header":
#             component["components"][param_field_name] = {
#                 "type": "component-type",  # This will be specific to the header type
#                 "value": param_value
#             }
#         elif location == "body":
#             component["components"][param_field_name] = {
#                 "type": "text",  # For body, the type is typically "text"
#                 "value": param_value
#             }
#         elif location == "button":
#             component["components"][param_field_name] = {
#                 "type": "text",  # For button, the type is "text" but could be more specific
#                 "value": param_value
#             }
        
#         components.append(component)

#     # Prepare the full payload
#     payload = json.dumps({
#         "integrated_number": "from-number",  # Replace with your actual 'from' number
#         "content_type": "template",
#         "payload": {
#             "type": "template",
#             "template": {
#                 "name": template_name,
#                 "language": {
#                     "code": language_code,
#                     "policy": "deterministic"
#                 },
#                 "to_and_components": components
#             },
#             "messaging_product": "whatsapp"
#         }
#     })

#     return payload

# def send_message_via_api(payload):
#     """Send the prepared message using the MSG91 API."""
#     conn = http.client.HTTPSConnection("control.msg91.com")

#     headers = {
#         'authkey': "Enter your authkey",  # Replace with your actual MSG91 authkey
#         'content-type': "application/json",
#         'accept': "application/json"
#     }

#     conn.request("POST", "/api/v5/whatsapp/whatsapp-outbound-message/bulk/", payload, headers)

#     res = conn.getresponse()
#     data = res.read()

#     # Print or log the response
#     print(data.decode("utf-8"))
