# Copyright (c) 2022, efeone Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
import http.client
import re
import mimetypes
import json
from typing import Dict
from six import string_types

from frappe.model.document import Document
# Process template while saving them in WhatsApp Communication.
def process_template_parameter(template = None, template_parameter = None, header_media = None):
	frappe.log_error("pro",[template, template_parameter])
	if isinstance(template_parameter, str):
		template_parameter = json.loads(template_parameter)
	elif isinstance(template_parameter, dict):
		template_parameter = template_parameter
	items = []
	if template:
		template_doc = frappe.get_doc("WhatsApp Templates", template)
		for row in template_doc.parameter:
			temp = {}
			temp["parameter"] = row.get("field_name")
			temp["location"] = row.get("location")
			temp["subtype"] = row.get("subtype")
			temp["type"] = row.get("type")
			if header_media and row.get("location") == "header":
				temp["value"] = header_media
			else:
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

	# Return number start with 91 to send whatsapp template correctly.
	def validate_and_normalize_number(self, number):
		cleaned_number = re.sub(r'\D', '', number)

		if len(cleaned_number) == 10 and cleaned_number[0] in '6789':
			return '91' + cleaned_number
		
		elif len(cleaned_number) == 11 and cleaned_number[0] == '0' and cleaned_number[1] in '6789':
			return '91' + cleaned_number[1:]
		
		elif len(cleaned_number) == 12 and cleaned_number.startswith('91') and cleaned_number[2] in '6789':
			return cleaned_number
		
		elif len(cleaned_number) == 13 and cleaned_number.startswith('+91') and cleaned_number[3] in '6789':
			return cleaned_number[1:]  

		return None
	
	# Method to use whatsapp msg**

	@frappe.whitelist()
	def send_message(self):
		if not self.to:
			frappe.throw("Recepient (`to`) is required to send message.")

		access_token = self.get_access_token()
		authkey = frappe.utils.password.get_decrypted_password("WhatsApp Cloud API Settings", "WhatsApp Cloud API Settings", "access_token")
		api_base_url = frappe.db.get_single_value("WhatsApp Cloud API Settings", "url")
		endpoint = frappe.db.get_single_value("WhatsApp Cloud API Settings", "endpoint")
		phone_number_id = frappe.db.get_single_value("WhatsApp Cloud API Settings", "phone_number_id")

		response_data = {
			"integrated_number": phone_number_id,  # Replace with your WhatsApp number
			"content_type": "template",
			"payload": {
				"type": "template",
				"template": {
					"name": self.whatsapp_message_template,  # Template name from Whatsapp
					"language": {
						"code": self.template_language,  # Language code
						"policy": "deterministic"
					},
					"to_and_components": []
				},
				"messaging_product": "whatsapp"
			}
		}

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
			body_components = {}

			# Button Parameter
			button_parameters = []
			button_components = {}
   
			# Header Parameter
			headers_parameters = []
			header_component = {}
			components_dict = {}
			frappe.log_error("param", self.parameters)
			for param in self.parameters:
				if param.location == 'button' and param.subtype == 'url':
					button_parameters.append({
						"subtype": "url",  
						"type": "text",  
						"value": param.value  
					})
				elif param.location == 'body':
					body_parameters.append({
						"type": "text", 
      					"value": param.value
					})
				elif param.location == 'header':
					headers_parameters.append({
						"type": param.type,
						"value": param.value
      				})
			for i, param in enumerate(body_parameters, 1):
				body_components[f"body_{i}"] = param
    
			for i, button in enumerate(button_parameters, 1):  # Start indexing from 1
				button_components[f"button_{i}"] = button
    
			for i, button in enumerate(headers_parameters, 1):  # Start indexing from 1
				button_components[f"header_{i}"] = button

			if self.header_has_media:
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
			new_components = {
				"to":[self.to],
				"components": components_dict
			}
			response_data["payload"]["template"]["to_and_components"].append(new_components)
		response_data = json.dumps(response_data)
		frappe.log_error("response", response_data)
		frappe.log_error("endpont", endpoint)
		conn = http.client.HTTPSConnection(api_base_url)
		response = conn.request("POST", endpoint, response_data, headers={"authkey": authkey, "Content-Type": "application/json", 'accept': "application/json"})
		response = conn.getresponse()
		data = response.read()
		frappe.log_error("res from msg91", json.loads(data.decode("utf-8")))
		# frappe.throw("Reached")
		response = json.loads(data.decode("utf-8"))
		if response.get('status'):
			self.message_id = response.get("request_id")
			self.status = "Sent"
			self.save(ignore_permissions=True)
			# if self.is_welcome_message:
			# 	frappe.msgprint(("Welcome Message sent to {0} ").format(self.to), alert=True, indicator="green")
			# else:
			# 	if self.message_type not in ("Audio", "Image", "Video", "Document"):
			# 		frappe.msgprint(("WhatsApp Message sent to {0} ").format(self.to), alert=True, indicator="green")
			# 	else:
			# 		frappe.msgprint(("Attachment sent to {0} ").format(self.to), alert=True, indicator="green")
			# return response.json()
		else:
			frappe.throw(response.json().get("error").get("message"))

	@classmethod
	def send_whatsapp_message(self, receiver_list, message, template, doctype, docname, template_parameter = None, media=None, file_name=None, header_media = None):
		if isinstance(receiver_list, string_types):
			if not isinstance(receiver_list, list):
				receiver_list = [receiver_list]
		frappe.log_error("receiver_list", receiver_list)
		for rec in receiver_list:
			"""
			Iterate receiver_list and send message to each recepient
			"""
			frappe.log_error("rec", rec)
			self.create_whatsapp_message(self.validate_and_normalize_number(self, rec), message, template, doctype, docname, template_parameter, media, file_name, header_media) #For Text Message or Caption for documents
			if media and file_name:
				self.create_whatsapp_message(self.validate_and_normalize_number(self, rec), message, template, doctype, docname, template_parameter, media, file_name, header_media) #For Document


	def create_whatsapp_message(to, message, template=None, doctype=None, docname=None, template_parameter = None, media=None, file_name=None, header_media = None):
		"""
		Create WhatsApp Communication with given data.
		"""
		template_items = process_template_parameter(template, template_parameter, header_media)
		frappe.log_error("log", header_media)
		wa_msg = frappe.get_doc({
			"doctype": "WhatsApp Communication",
			"to": to,
			"reference_dt": doctype,
			"whatsapp_message_template": template,
			"reference_dn": docname,
			"message_type": "Template",
			"parameters": template_items,
			"message_body" : message,
			"header_media": header_media
		})
		wa_msg.save(ignore_permissions = 1)
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
		wa_msg.send_message() #Send Attachment/Text Message

			
     
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
def update_message_status(**args):
	''' Method to updtae status of Message '''
	frappe.log_error("status", args)
	message_id = args.get("request_id")
	status = args.get("status")
	failure_reason = args.get("failure_reason")

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
