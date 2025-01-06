// Copyright (c) 2023, efeone Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on('WhatsApp Campaign', {
    setup: function (frm) {
        frm.get_field("parameters").grid.cannot_add_rows = true;
        frm.refresh_field("parameters");
        // frm.set_query('whatsapp_message_template', () => {
        //     return {
        //         filters: {
        //             docstatus: 1
        //         }
        //     }
        // });
    },
    whatsapp_message_template: function (frm) {
        set_template_parameters(frm);
    }
});

frappe.ui.form.on('WhatsApp Message Template Item', {
    parameters_remove: function (frm, cdt, cdn) {
        frappe.show_alert({
            message: __('You are not allowed to add/remove parameter Manually!. Changes will be reverted.'),
            indicator: 'red'
        }, 5);
        set_template_parameters(frm);
    },
    parameters_add: function (frm, cdt, cdn) {
        frappe.show_alert({
            message: __('You are not allowed to add/remove parameter Manually!. Changes will be reverted.'),
            indicator: 'red'
        }, 5);
        set_template_parameters(frm);
    }
});

function set_template_parameters(frm) {
    if (frm.doc.whatsapp_message_template) {
        frappe.call({
            method: 'frappe_meta_integration.whatsapp.doctype.whatsapp_message_template.whatsapp_message_template.set_template_parameters',
            args: {
                "whatsapp_message_template": frm.doc.whatsapp_message_template
            },
            callback: function (r) {
                console.log(r)
                frm.clear_table('parameters');
                for (var i = 0; i < r.message.length; i++) {
                    let row = frm.add_child('parameters', {
                        parameter: r.message[i].field_name,
                        location: r.message[i].location,
                        type: r.message[i].type,
                        subtype: r.message[i].subtype,
                    });
                }
                frm.save()
            }
        });
    }
}

//updated code - sukhman

frappe.ui.form.on('WhatsApp Campaign', {
    refresh: function (frm) {
        frm.trigger('setup_filters');
        // Add styles
        if (!document.getElementById('whatsapp-campaign-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'whatsapp-campaign-styles';
            styleSheet.textContent = `

              .filter-area {
                  margin-bottom: 15px;
              }

              .filter-toolbar {
                  display: flex;
                  justify-content: flex-end;
                  padding-top: 10px;
                  border-top: 1px solid #ebeef0;
              }

              .filter-buttons {
                  display: flex;
                  gap: 8px;
              }

              .filter-buttons .btn {
                  padding: 4px 12px;
                  font-size: 12px;
              }

              .filter-group .filter-field {
                  margin-bottom: 8px;
              }

              .filter-group .remove-filter {
                  color: #dc2626;
              }
              
              .loading-message {
                  margin-top: 10px;
                  color: #4a5568;
                  font-style: italic;
              }
          `;
            document.head.appendChild(styleSheet);
        }
    },

    
    setup_filters: function (frm) {
        if (!frm.filter_wrapper) {
            frm.filter_wrapper = $('<div class="filter-section">');
            let recipients_field = frm.get_field('recipients');
            if (recipients_field && recipients_field.wrapper) {
                frm.filter_wrapper.insertBefore(recipients_field.wrapper);
            }
        }

        if (frm.doc.select_doctype) {
            frm.trigger('select_doctype');
        }
    },

    before_save: function (frm) {
        // Ensure current filters are saved before form submission
        if (frm.filter_group) {
            const currentFilters = frm.filter_group.get_filters();
            frm.doc.saved_filters = JSON.stringify(currentFilters);
        }
    },

    after_save: function (frm) {
        // Reapply filters after save
        frm.trigger('setup_filters');
    },

    select_doctype: function (frm) {
        if (!frm.doc.select_doctype) return;

        frm.filter_wrapper.empty();

        frappe.model.with_doctype(frm.doc.select_doctype, () => {
            let filter_area = $('<div class="filter-area">').appendTo(frm.filter_wrapper);

            // Initialize filter group
            frm.filter_group = new frappe.ui.FilterGroup({
                parent: filter_area,
                doctype: frm.doc.select_doctype,
                on_change: function () {
                    // Save filters immediately when they change
                    const currentFilters = this.get_filters();
                    frm.doc.saved_filters = JSON.stringify(currentFilters);
                    frm.dirty();
                    frm.save_disabled = false;
                    frm.page.clear_primary_action();
                }
            });

            let filter_toolbar = $('<div class="filter-toolbar">').appendTo(frm.filter_wrapper);
            let loading_message = $('<div class="loading-message">').hide().appendTo(frm.filter_wrapper);

            let buttons = $(`
              <div class="filter-buttons">
                  <button class="btn btn-xs btn-primary apply-filters">Apply</button>
              </div>
          `).appendTo(filter_toolbar);

            // Restore saved filters
            try {
                if (frm.doc.saved_filters) {
                    const savedFilters = JSON.parse(frm.doc.saved_filters);
                    if (Array.isArray(savedFilters) && savedFilters.length > 0) {
                        savedFilters.forEach(filter => {
                            if (filter && Array.isArray(filter) && filter.length >= 4) {
                                frm.filter_group.add_filter(
                                    frm.doc.select_doctype,
                                    filter[1],
                                    filter[2],
                                    filter[3]
                                );
                            }
                        });
                    } else {
                        frm.filter_group.add_filter(frm.doc.select_doctype, '', '=', '');
                    }
                } else {
                    frm.filter_group.add_filter(frm.doc.select_doctype, '', '=', '');
                }
            } catch (e) {
                console.error('Error restoring filters:', e);
                frm.filter_group.add_filter(frm.doc.select_doctype, '', '=', '');
            }

            buttons.find('.apply-filters').on('click', () => {
                const currentFilters = frm.filter_group.get_filters();
                if (!currentFilters?.length) {
                    frappe.msgprint('Please set at least one filter');
                    return;
                }

                // Save current filters before applying
                frm.doc.saved_filters = JSON.stringify(currentFilters);

                loading_message.html('Finding recipients...').show();

                frappe.call({
                    method: 'apply_filters_and_get_recipients',
                    doc: frm.doc,
                    args: { filters: currentFilters },
                    freeze: true,
                    freeze_message: 'Finding recipients...',
                    callback: function (r) {
                        loading_message.hide();
                        if (!r.message) return;

                        frm.clear_table('recipients');
                        r.message.forEach(recipient => {
                            let row = frm.add_child('recipients');
                            row.whatsapp_number = recipient.whatsapp_number;
                            row.person_name = recipient.person_name;
                        });
                        frm.refresh_field('recipients');
                        frappe.show_alert('Recipients updated', 5);
                    }
                });
            });
        });
    }
});


frappe.ui.form.on('WhatsApp Campaign', {
    refresh: function (frm) {
        // Trigger the function to set parameter_data options when whatsapp_message_template is already set
        if (frm.doc.whatsapp_message_template) {
            frm.trigger('fetch_parameters');
        }
    },

    whatsapp_message_template: function (frm) {
        // Trigger the fetch_parameters function when whatsapp_message_template is selected
        frm.trigger('fetch_parameters');
    },

    fetch_parameters: function (frm) {
        if (!frm.doc.whatsapp_message_template) {
            // Clear options if no template is selected
            frm.set_df_property('parameter_data', 'options', '');
            return;
        }

        // Fetch the WhatsApp Message MSG91 document where the name matches whatsapp_message_template
        frappe.db.get_doc('WhatsApp Message MSG91', cur_frm.doc.whatsapp_message_template)
            .then((doc) => {
                if (doc) {
                    const parameter_table = doc.parameter || [];
                    let field_names = [];

                    // Iterate over the parameter child table to get field_name
                    for (let row of parameter_table) {
                        if (row.field_name) {
                            field_names.push(row.field_name);
                        }
                    }

                    // Update options for parameter_data field in WhatsApp Campaign
                    if (field_names.length > 0) {
                        frm.set_df_property('parameter_data', 'options', field_names.join('\n'));
                    } else {
                        frappe.msgprint(__('No parameters found in the selected WhatsApp Message Template.'));
                        frm.set_df_property('parameter_data', 'options', '');
                    }
                } else {
                    frappe.msgprint(__('WhatsApp Message Template not found.'));
                    frm.set_df_property('parameter_data', 'options', '');
                }
            })
            .catch(() => {
                frappe.msgprint(__('Failed to fetch parameters.'));
                frm.set_df_property('parameter_data', 'options', '');
            });
    }
});

frappe.ui.form.on('WhatsApp Campaign', {
    onload_post_render: function (frm) {
        // Exit early if Customer Name is not specified
        if (!frm.doc.name) {
            frappe.msgprint(__('Customer Name is not specified. Please provide it.'));
            return;
        }
        
        const deviceFilters = [
            { field: 'pending', label: 'Pending', filters: { pending: frm.doc.name } },
            { field: 'read', label: 'Read', filters: { read: frm.doc.name, } },
            { field: 'received', label: 'Received', filters: { received: frm.doc.name } },
            { field: 'read', label: 'Read', filters: { read: frm.doc.name } },
            { field: 'sent', label: 'Sent', filters: { sent: frm.doc.name } },
            { field: 'delivered', label: 'Delivered', filters: { delivered: frm.doc.name} },
            { field: 'marked_as_seen', label: 'Marked As Seen', filters: { marked_as_seen: frm.doc.name} },
            { field: 'failed', label: 'Failed', filters: { failed: frm.doc.name} },
        ];
    }
});
