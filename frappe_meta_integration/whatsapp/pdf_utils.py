from __future__ import unicode_literals
import frappe
from frappe import get_print as p
from frappe import _
import json
import urllib
from frappe import publish_progress
from frappe.utils.file_manager import save_file
from frappe.utils.pdf import get_pdf



@frappe.whitelist()
def create_new_folder(file_name, folder):
	"""create new folder under current parent folder"""
	file = frappe.new_doc("File")
	file.file_name = file_name
	file.is_folder = 1
	file.folder = folder
	file.insert(ignore_if_duplicate=True)
	return file

def attach_pdf(doc, event=None, print_format=None):
    fallback_language = "en"
    args = {
        "doctype": doc.doctype,
        "name": doc.name,
        "title": doc.get_title(),
        "lang": getattr(doc, "language", fallback_language),
        "show_progress":1,
        "print_format" : print_format
    }

    execute(**args)

def execute(doctype, name, title, lang=None, show_progress=True, print_format=None):
    """
    Queue calls this method, when it's ready.
    1. Create necessary folders
    2. Get raw PDF data
    3. Save PDF file and attach it to the document
    """
    progress = frappe._dict(title=_("Creating PDF ..."), percent=0, doctype=doctype, docname=name)

    if lang:
        frappe.local.lang = lang

    if show_progress:
        publish_progress(**progress)

    doctype_folder = create_folder(_(doctype), "Home")
    title_folder = create_folder(title, doctype_folder)

    if show_progress:
        progress.percent = 33
        publish_progress(**progress)

    pdf_data = get_pdf_data(doctype, name, print_format)

    if show_progress:
        progress.percent = 66
        publish_progress(**progress)

    save_and_attach(pdf_data, doctype, name, title_folder)

    if show_progress:
        progress.percent = 100
        publish_progress(**progress)

def create_folder(folder, parent):
    """Make sure the folder exists and return it's name."""
    new_folder_name = "/".join([parent, folder])

    if not frappe.db.exists("File", new_folder_name):
        create_new_folder(folder, parent)

    return new_folder_name

def get_pdf_data(doctype, name, print_format=None):
    """Document -> HTML -> PDF."""
    if print_format:
        html = frappe.get_print(doctype, name, print_format)
    else:
        html = frappe.get_print(doctype, name)
    return frappe.utils.pdf.get_pdf(html)


def save_and_attach(content, to_doctype, to_name, folder):
    """
    Save content to disk and create a File document.
    File document is linked to another document.
    """
    file_name = "{}.pdf".format(to_name.replace(" ", "-").replace("/", "-"))
    file_url = save_file(file_name, content, to_doctype, to_name, folder=folder, is_private=1)
    return file_url

@frappe.whitelist()
def get_attach_link(doc, print_format):
    doc = json.loads(doc)
    doc = frappe.get_doc(doc.get("doctype"), doc.get("docname"))
    key = frappe.db.get_value("Document Share Key",{
                'reference_doctype': doc.doctype,
                'reference_docname': doc.name,
                'creation': ('>=', frappe.utils.today())
			},"key")
    if not key:
        key = doc.get_document_share_key()
    url = f'{frappe.utils.get_url()}/{safe_encode(doc.get("doctype"))}/{safe_encode(doc.get("name"))}?format={safe_encode(print_format)}&key={safe_encode(key)}'
    return url
def safe_encode(value):
    return urllib.parse.quote(value.encode("utf-8") if value else '')


    
    