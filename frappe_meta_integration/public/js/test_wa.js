frappe.provide('frappe.ui.form');
frappe.provide('frappe.model.docinfo');
frappe.provide("frappe.views");

$(document).ready(function () {
    frappe.ui.form.Controller = Class.extend({
        init: function (opts) {
            $.extend(this, opts);
            this.setupMenuItem();
        },
        setupMenuItem: function() {
            let ignored_doctype_list = ["DocType", "Customize Form"];
            frappe.ui.form.on(this.frm.doctype, {
                refresh: (frm) => {
                    if (!ignored_doctype_list.includes(frm.doc.doctype)) {
                        frm.page.add_menu_item(__('Send via WhatsApp'), () => send_sms(frm));
                    }
                }
            });
        }
    });
});


function send_sms(frm) {
    if (frm.is_dirty()) {
        frappe.throw(__('You have unsaved changes. Save before send.'));
    } else {
        create_recipients_dialog(frm);
    }
}

function create_recipients_dialog(frm) {
    cur_frm.dialog_counter = 0
    let context = {}
    let contact_list = build_contact_list([], [], {});

    
    // Create the dialog
    let d = new frappe.ui.Dialog({
        title: frm.doc.doctype + " : " + frm.doc.name,
        fields: [
            {
                label: __("To"),
                fieldtype: "MultiSelect",
                reqd: 1,
                fieldname: "recipients",
                options: contact_list,
                description: "<strong>Note</strong>: Please enter contact with Country Code"
            },
            {
                label: __("WhatsApp Template"),
                fieldtype: "Link",
                reqd: 1,
                fieldname: "whatsapp_template",
                options: "WhatsApp Message MSG91",
                get_query: function () {
                    return { filters: { "enabled": 1 } };
                },
                onchange: function(e){
                    
                    handle_template_change(d, this, context);
                }
            },
            { 'label': __("Content"), 'fieldname': 'content', 'fieldtype': 'HTML' }
        ],
        primary_action_label: __("Send"),
        primary_action(values) {
            dialog_primary_action(frm, values, context);
            d.hide();
        },
        secondary_action_label: __("Discard"),
        secondary_action() {
            d.hide();
        },
        size: 'large',
        minimizable: true
    });

    d.show(); // Show the dialog
}

// Function to handle WhatsApp template change
function handle_template_change(d, element, context) {
    if(cur_frm.dialog_counter){
        console.log(cur_frm.dialog_counter)
        clear_previous_template_fields(d);
    }
    // clear_previous_template_fields(d);


    const whatsapp_template = d.get_field("whatsapp_template");
    const content = d.get_field("content");
    whatsapp_template.refresh();
    content.refresh();

    if (element.value) {
        fetch_template_data(element.value, d, context);
    }
}

function clear_previous_template_fields(d) {
    // Remove all fields that were dynamically created (those created for the template parameters)
    if (d.fields_dict) {
        
        // Loop through the fields and remove the ones created for the template
        Object.keys(d.fields_dict).forEach((fieldname) => {

            let field = d.fields_dict[fieldname];
            // Check if the field is related to the template (in this case, it's any field created for a template)
            console.log(fieldname,"fieldname")
            if (fieldname !== "recipients" && fieldname !== "whatsapp_template" && fieldname !== "content" && fieldname !== "__section_1") {
                console.log(d.fields_dict[fieldname], "d.fields_dict[fieldname]")
                d.fields_dict[fieldname].$wrapper.remove();
                delete d.fields_dict[fieldname];  // Remove the field from the dict
            }
        });
    }
}


// Fetch template data from the WhatsApp Message template
function fetch_template_data(templateId, d, context) {
    let counter = 0;
    console.log(templateId)
    frappe.db.get_doc("WhatsApp Message MSG91", templateId).then((data) => {
        counter += 1;
        console.log(counter)
        cur_frm.dialog_counter = counter
        if (counter == 1) {
            process_template_data(d, data, context);
        }
    });
    
}

// Process the template data and create fields accordingly
function process_template_data(d, data, context) {
    let elements = document.getElementsByClassName("modal-body ui-front");
	Array.from(elements).forEach((e) => { e.addEventListener("click", function () { verify(d, data, context, cur_frm.dialog_header_html); }); })

    let option_list = ["Attachment"];

    // if (frappe.model.can_print(null, cur_frm) && !cur_frm.meta.issingle) {
    //     option_list.push("Print Format");
    // }

    cur_frm.fields_list = data.parameter;
    data.parameter.forEach((param) => {
        create_template_field(param, option_list, d, context, data);
        context[param.field_name] = "";
    });

    update_template_content(data.template, d);
}

// Create fields for the template parameters
function create_template_field(param, option_list, d, context, data_tempalate) {
    console.log(param, option_list, context)
    // Create Select field for header location
    console.log(param)
    if (param.location === "header" && param.type != "text") {
        d.make_field({
            "fieldtype": "Select",
            "label": param.field_name,
            "fieldname": param.field_name,
            "options": option_list,
            "reqd": 1
        });
        let field = d.get_field(param.field_name);
        field.set_value("Attachment");
        field.refresh();
    } else {
        d.make_field({
            "fieldtype": "MultiSelect",
            "label": param.field_name,
            "fieldname": param.field_name,
            "reqd": 1
        });
    }

    // Create Attachment field (hidden by default)
    d.make_field({
        "label": __("Attachment"),
        "fieldtype": "Attach",
        "fieldname": `${param.field_name}_attachment`,
        "hidden": true
    });
    // Create Print Format field (hidden by default)
    d.make_field({
        "label": __("Select Print Format"),
        "fieldtype": "Select",
        "fieldname": `${param.field_name}_print_format`,
        "options": frappe.meta.get_print_formats(cur_frm.meta.name),
        "hidden": true
    });

    // Refresh fields after creation
    d.get_field(`${param.field_name}_attachment`).refresh();
    if(param.location == "header" && param.type != "text"){
        let field = d.get_field(param.field_name + "_attachment");
        field.set_value(data_tempalate.header_media);
        field.refresh();
    }
    d.get_field(`${param.field_name}_print_format`).refresh();
    d.get_field(param.field_name).refresh();
    context[param.field_name] = "";
    if (param.type == "text") {
        let data = get_data_link_dict()
        d.get_field(param.field_name).set_data(data)
    }
    // Handle changes in the select fields (attachment/print format)
    d.fields_dict[param.field_name].input.onchange = function () {
        if (this.value && this.value.replace(", ", "") == "Attachment") {
            d.get_field(`${param.field_name}_attachment`).df.hidden = false;
            d.get_field(`${param.field_name}_attachment`).value = "";
            d.get_field(`${param.field_name}_attachment`).refresh();

            d.get_field(`${param.field_name}_print_format`).df.hidden = true;
            d.get_field(`${param.field_name}_print_format`).refresh();
            
        }
        else if (this.value && this.value.replace(", ", "") == "Print Format") {
            d.get_field(`${param.field_name}_attachment`).df.hidden = true;
            d.get_field(`${param.field_name}_attachment`).refresh();

            d.get_field(`${param.field_name}_print_format`).df.hidden = false;
            d.get_field(`${param.field_name}_print_format`).refresh();
            
        } else {
            d.get_field(`${param.field_name}_attachment`).df.hidden = true;
            d.get_field(`${param.field_name}_attachment`).refresh();

            d.get_field(`${param.field_name}_print_format`).df.hidden = true;
            d.get_field(`${param.field_name}_print_format`).refresh();
        }
    };
}

// Update the content area with the message template
function update_template_content(template, d) {
    $(d.get_field('content').wrapper).html(
        `<div class="card mb-3 h-100"><div class="card-body">${template}<br><br></div></div>`
    );
}

// Primary action: Send WhatsApp message
function dialog_primary_action(frm, values, context) {
    frappe.call({
        method: "frappe_meta_integration.whatsapp.utils.send_whatsapp_msg",
        args: {
            "doctype": frm.doc.doctype,
            "docname": frm.doc.name,
            "args": values,
            "template_parameter":context
        },
        freeze: true,
        freeze_message: ('Sending WhatsApp Message.!!')
    });
}

function build_contact_list(contact_list, doc_field_list, data_link_dict) {
    let contact_dict = {}; // Ensure it's defined here
    let contacts = [];

    // Loop through the form's fields to identify phone number fields and populate contact_dict
    cur_frm.meta.fields.forEach((field) => {
        if (field.options == "Phone") {
            contact_dict[field.fieldname] = field.label; // Populate contact_dict with fieldname and label
        }
    });

    // Now process the document's fields
    for (const [key, value] of Object.entries(cur_frm.doc)) {
        if (key in data_link_dict && value.replaceAll(" ", "") != "") {
            doc_field_list.push({ "value": value, "description": data_link_dict[key] });
        }

        if (key in contact_dict && value.replaceAll(" ", "") != "") {
            if (!contacts.includes(value)) {
                contacts.push(value);
                contact_list.push({ "value": value, "description": contact_dict[key] });
            }
        }
    }

    return contact_list;
}

// Return the list of contacts
function get_contact_list() {
    let contact_dict = {};
    let contact_list = [];

    cur_frm.meta.fields.forEach((field) => {
        if (field.options == "Phone") {
            contact_dict[field.fieldname] = field.label;
        }
    });

    return contact_list;
}

// Get doc field list for attachment and print formats
function get_doc_field_list() {
    let doc_field_list = [
        { "value": "Attachment", "description": "Attach a file" }
    ];

    // if (frappe.model.can_print(null, cur_frm) && !cur_frm.meta.issingle) {
    //     doc_field_list.push({
    //         "value": "Print Format",
    //         "description": "Print Format"
    //     });
    // }

    return doc_field_list;
}

// Get a list of available Data/Link fields
function get_data_link_dict() {
    let data_link_dict = {};
    let uniqueValues = new Set();

    cur_frm.meta.fields.forEach((e) => {
        if (e.fieldtype == "Data" || e.fieldtype == "Link") {
            data_link_dict[e.fieldname] = e.label;
        }
    });
    
    let result = Object.keys(data_link_dict).map((key) => {
        let value = cur_frm.doc[key];

        // Only add the key if the value is not empty and hasn't been added already
        if (value && !uniqueValues.has(value)) {
            uniqueValues.add(value); // Track the value
            return {
                value: value,
                description: data_link_dict[key]
            };
        }

        // If the value is empty or already added, return nothing (skip it)
        return null;
    });

    // Filter out null values (for skipped entries)
    return result.filter(item => item !== null);
}

function verify(d, data, context, header_html) {
    console.log(d, data, context)
    for (const [key, value] of Object.entries(context)) {
        if ((d.get_field(key).input.value).replace(", ", "") === "Attachment") {
            if (!d.get_field(key + "_attachment").value || d.get_field(key + "_attachment").value.length === 0) {
                return;
            }
            else if (d.get_field(key + "_attachment").value && d.get_field(key + "_attachment").value.includes("/private/")) {
                d.get_field(key + "_attachment").value = "";
                d.get_field(key + "_attachment").refresh();
                frappe.msgprint("Attachment File can't be Private");
            }
            else if (d.get_field(key + "_attachment").value && d.get_field(key + "_attachment").value.includes("https://")) {
                context[key] = d.get_field(key + "_attachment").value;
            } else {
                context[key] = (d.get_field(key + "_attachment").value);
            }
        } else if ((d.get_field(key).input.value).replace(", ", "") === "Print Format") {
            frappe.call({
                method: "frappe_meta_integration.whatsapp.pdf_utils.get_attach_link",
                args: { "doc": { "doctype": cur_frm.doc.doctype, "docname": cur_frm.doc.name }, "print_format": d.get_field(key + "_print_format").value },
                callback: (r) => {
                    context[key] = r.message;
                }
            });
        } else {
            context[key] = (d.get_field(key).input.value).replace(", ", "");
        }
    }

    // $(d.get_field('content').wrapper).html(
    //     `<div class="card mb-3 h-100"><div class="card-body">` + frappe.render(header_html, context) + frappe.render(data.message_body, context) + `<br><br></div></div>`
    // );

    d.get_primary_btn()[0].disabled = false;
}
