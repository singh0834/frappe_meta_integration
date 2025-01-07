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



//new code

frappe.ui.form.on('WhatsApp Campaign', {
    refresh: function (frm) {
        let html = `
            <div class="status-container">
                <style>
                    .status-container {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        padding: 30px;
                        border-radius: 10px;
                        margin-left: 40px;
                    }
                    .status-grid {
                        display: grid;
                        grid-template-columns: repeat(8, 1fr);
                        gap: 15px;
                        margin-bottom: 30px;
                    }
                    /* Base styles for all status items */
                    .status-item {
                        padding: 20px;
                        border-radius: 8px;
                        background-color: #fff;
                        border: 1px solid #ddd;
                        text-align: center;
                        white-space: nowrap;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    }
                    /* Consistent hover effect for all items */
                    .status-item:hover {
                        transform: scale(1.05);
                        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                    }
                    /* Label and count styles */
                    .status-item .status-label {
                        font-size: 14px;
                        text-transform: capitalize;
                        margin-bottom: 5px;
                    }
                    .status-item .status-count {
                        font-size: 24px;
                        font-weight: 600;
                    }
                    /* Status-specific colors */
                    .status-item.total-messages .status-label,
                    .status-item.total-messages .status-count { color: black; }
                    .status-item.pending .status-label,
                    .status-item.pending .status-count { color: orange; }
                    .status-item.read .status-label,
                    .status-item.read .status-count { color: blue; }
                    .status-item.received .status-label,
                    .status-item.received .status-count { color: green; }
                    .status-item.sent .status-label,
                    .status-item.sent .status-count { color: purple; }
                    .status-item.delivered .status-label,
                    .status-item.delivered .status-count { color: teal; }
                    .status-item.marked-as-seen .status-label,
                    .status-item.marked-as-seen .status-count { color: brown; }
                    .status-item.failed .status-label,
                    .status-item.failed .status-count { color: red; }

                    @media (max-width: 768px) {
                        .status-grid {
                            grid-template-columns: repeat(4, 1fr);
                        }
                    }
                    @media (max-width: 480px) {
                        .status-grid {
                            grid-template-columns: repeat(2, 1fr);
                        }
                    }
                </style>

                <div class="status-grid">
                    <!-- Total Messages -->
                    <div class="status-item total-messages"">
                        <div class="status-label">Total</div>
                        <div class="status-count">${frm.doc.total_int || 0}</div>
                    </div>
                    <!-- Pending -->
                    <div class="status-item pending" data-status="Pending">
                        <div class="status-label">Pending</div>
                        <div class="status-count">${frm.doc.pending_int || 0}</div>
                    </div>
                    <!-- Read -->
                    <div class="status-item read" data-status="Read">
                        <div class="status-label">Read</div>
                        <div class="status-count">${frm.doc.read_int || 0}</div>
                    </div>
                    <!-- Received -->
                    <div class="status-item received" data-status="Received">
                        <div class="status-label">Received</div>
                        <div class="status-count">${frm.doc.received_int || 0}</div>
                    </div>
                    <!-- Sent -->
                    <div class="status-item sent" data-status="Sent">
                        <div class="status-label">Sent</div>
                        <div class="status-count">${frm.doc.sent_int || 0}</div>
                    </div>
                    <!-- Delivered -->
                    <div class="status-item delivered" data-status="Delivered">
                        <div class="status-label">Delivered</div>
                        <div class="status-count">${frm.doc.delivered_int || 0}</div>
                    </div>
                    <!-- Marked as Seen -->
                    <div class="status-item marked-as-seen" data-status="Marked as Seen">
                        <div class="status-label">Marked as Seen</div>
                        <div class="status-count">${frm.doc.marked_as_seen_int || 0}</div>
                    </div>
                    <!-- Failed -->
                    <div class="status-item failed" data-status="Failed">
                        <div class="status-label">Failed</div>
                        <div class="status-count">${frm.doc.failed_int || 0}</div>
                    </div>
                </div>
            </div>
        `;

        // Set the HTML content
        $(frm.fields_dict.overview.wrapper).html(html);

        // Attach click handlers with proper event delegation
        $(frm.fields_dict.overview.wrapper).on('click', '.status-item', function() {
            let status = $(this).data('status');
            // Create URL object to handle parameters properly
            let url = new URL('/app/whatsapp-communication', window.location.origin);
            // Use URLSearchParams to set the parameter without encoding spaces
            url.searchParams.set('status', status);
            // Get the final URL and decode it to preserve spaces
            let finalUrl = decodeURIComponent(url.toString());
            window.location.href = finalUrl;
        });
    },

    on_submit: function (frm) {
        frappe.call({
            method: 'frappe_meta_integration.whatsapp.doctype.whatsapp_campaign.whatsapp_campaign.get_campaign_status_counts',
            args: {
                name: frm.doc.name
            },
            callback: function (r) {
                if (r.message && r.message.success) {
                    frm.reload_doc();
                }
            }
        });
    }
});
