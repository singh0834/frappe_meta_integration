from __future__ import unicode_literals

import frappe
from frappe import _
import http.client
import json, re
import string
from frappe_meta_integration.whatsapp.doctype.whatsapp_communication.whatsapp_communication import WhatsAppCommunication
from frappe.utils.print_format import download_pdf
from frappe_meta_integration.whatsapp.pdf_utils import *

@frappe.whitelist()
def get_message_templates():
    try:
        if not frappe.db.get_single_value("WhatsApp Cloud API Settings", "enabled"):
            return [False, "WhatsApp Service is not Enabled"]
        
        integrated_number = frappe.db.get_single_value("WhatsApp Cloud API Settings", "phone_number_id")
        url = frappe.db.get_single_value("WhatsApp Cloud API Settings", "url")
        version = frappe.db.get_single_value("WhatsApp Cloud API Settings", "version")
        get_template_endpoint = frappe.db.get_single_value("WhatsApp Cloud API Settings", "get_template_endpoint")

        if not url and not version and not get_template_endpoint:
            return [False, "WhatsApp Service is not Configured Properly"]
        
        authKey = frappe.utils.password.get_decrypted_password(
            "WhatsApp Cloud API Settings", "WhatsApp Cloud API Settings", "access_token"
        )
        
        headers = {
            'accept': "application/json",
            'authkey': authKey
        }

        saved_templates = [x.name for x in frappe.get_list("WhatsApp Templates")]
        conn = http.client.HTTPSConnection(url)

        conn.request("GET", f"/api/{version}/{get_template_endpoint}/{integrated_number}", headers=headers)
        
        res = conn.getresponse()
        data = res.read()
        response = json.loads(data.decode("utf-8"))
        frappe.log_error("reposene when fetch", response)
        parsed_data = parse_templates(response)
        create_template_records(parsed_data)
        return [True, "WhatsApp Templates Fetched Successfully"]
    except Exception as e:
        return [False, "Check WhatsApp Configuration"]

def parse_templates(data):
    """
    Parse the WhatsApp template data and extract the required fields based on the specified structure.    
    Returns:
        A list of dictionaries with the relevant extracted fields.
    """
    try:
        # Check if status is 'success'
        if data.get("status") != "success":
            return [False, "WhatsApp Templates Failed while Fetching"]
        
        templates = []
        for template_data in data.get('data', []):
            flag = True
            template = {
                'category': template_data.get('category'),
                'name': template_data.get('name'),
                'namespace': template_data.get('namespace'),
                'languages': []
            }

            for language_data in template_data.get('languages', []):
                frappe.log_error("state", language_data.get('status'))
                if language_data.get('status') == 'REJECTED':
                    flag  = False
                    frappe.log_error("stat", language_data.get('status'))
                    break
                language = {
                    'id': language_data.get('id'),
                    'language': language_data.get('language'),
                    'status': language_data.get('status'),
                    'rejection_reason': language_data.get('rejection_reason'),
                    'variables': language_data.get('variables', []),
                    'variable_type': language_data.get('variable_type', {}),
                    'code': []
                }

                for code_element in language_data.get('code', []):
                    if code_element['type'] == 'BODY' or code_element['type'] == 'FOOTER':
                        if 'text' in code_element:
                            language['code'].append({'type': code_element['type'], 'text': code_element['text']})
                    
                    if code_element['type'] == 'HEADER' and 'format' in code_element and code_element['format'] == 'TEXT':
                        if 'text' in code_element:
                            language['code'].append({'type': 'HEADER', 'text': code_element['text']})
                    
                    if code_element['type'] == 'BUTTONS':
                        for button in code_element.get('buttons', []):
                            if button.get('type') == 'URL' and 'text' in button and 'url' in button:
                                language['code'].append({'type': 'BUTTONS', 'text': button['text'], 'url': button['url']})
                
                template['languages'].append(language)
            if flag:
                templates.append(template)

        return templates
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "WhatsApp Templates Errored")
        return [False, "WhatsApp Templates Failed to Fetch"]

def create_template_records(data):
    try:
        template_records = []
        for template in data:
            template_name = template.get('name')
            namespace = template.get('namespace')
            category = template.get('category')

            for language in template.get('languages', []):
                language_code = language.get('language')
                variables_type = language.get('variable_type', {})
                variables = language.get('variables', [])

                header_has_media = False
                header_type = variables_type.get('header_1', {}).get('type', '')
                if header_type in ['video', 'document', 'image']:
                    header_has_media = True

                header = header_type if header_type not in "text" else ""

                footer = None
                for code in language.get('code', []):
                    if code.get('type') == 'FOOTER' and 'text' in code:
                        footer = code['text']
                
                template_text = ""
                body_texts = []
                button_texts = []
                for code in language.get('code', []):
                    if 'text' in code:
                        if code['type'] == 'BODY':
                            body_texts.append(code['text'])
                        elif code['type'] == 'BUTTONS':
                            button_texts.append(f"{code.get('text')} {code.get('url')}")
                        else:
                            template_text += f"{code['text']} "  
                
                template_text += " ".join(body_texts) + " ".join(button_texts)

                parameters = []
                for variable in variables:
                    location = ''
                    subtype = ''
                    field_type = ''
                    
                    variable_info = variables_type.get(variable, {})
                    field_type = variable_info.get('type', '')
                    subtype = variable_info.get('subtype', '')

                    if 'header' in variable:
                        location = 'header'
                    elif 'body' in variable:
                        location = 'body'
                    elif 'button' in variable:
                        location = 'button'

                    parameters.append({
                        'field_name': variable,
                        'location': location,
                        'subtype': subtype,
                        'type': field_type
                    })
                
                template_record = {
                    'template_name': template_name,
                    'namespace': namespace,
                    'header_has_media': header_has_media,
                    'media_type': header,
                    'footer': footer,
                    'category': category,
                    'language_code': language_code,
                    'template': template_text.strip(),
                    'parameter': parameters
                }
                existing_template = frappe.db.exists(
                    "WhatsApp Templates",
                    {
                        "name": template_name
                    }
                )
                if existing_template:
                    continue
                doc = frappe.get_doc({
                    'doctype': 'WhatsApp Templates',
                    'enabled': 0,
                    **template_record
                })
                doc.insert()
                template_records.append(template_record)

        # frappe.log_error("templates", template_records)
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Templates Errored")
        return [False, "Failed to Save the Template"]
