#!/bin/bash
# Scratch helper: empty every table so a driver run starts from nothing.
psql postgres://postgres@localhost:5433/app_57_matpass -q -c "
delete from deliveries; delete from announcements; delete from audit_log;
delete from checkins; delete from promotions; delete from grading_candidates;
delete from grading_events; delete from retention_flags; delete from enrollments;
delete from subscriptions; delete from students; delete from families;
delete from membership_plans; delete from class_schedule; delete from ranks;
delete from programs; delete from kiosk_devices; delete from locations;
delete from users; delete from schools; delete from webhook_events;"
