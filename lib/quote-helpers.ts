import type {
  BuilderLineItem,
  Quote,
  QuoteSection,
  QuoteStatus,
} from "./types";
import { products } from "./mock-data/products";
import { defaultClassificationFor } from "./classifications";
import { businessQuoteNumber } from "./format";
import { isValidQuoteThemeSlug, type QuoteThemeSlug } from "@/lib/quote-themes";
import type { QuoteTemplateSlug } from "./company-profile";

export const DEFAULT_TAX_RATE = 0.13; // ON HST
export const DEFAULT_LABOR_RATE = 145;

export const DEFAULT_TERMS = `NEXVELON INTEGRATED SOLUTIONS INC. — Terms & Conditions

This Quote/Proposal and any resulting agreement are made with Nexvelon Integrated Solutions Inc. (Ontario Corporation No. 1001583803), carrying on business as "Nexvelon Global" (the "Company" or "Nexvelon"). The other party is the "Client" (also the "Owner" where it acts as such, or the "GC" / General Contractor where applicable). All obligations, warranties, and liabilities under this Agreement are those of Nexvelon Integrated Solutions Inc. alone.

1. Parties, Brand, and Affiliated Companies
1.1 Contracting party. The only contracting party on the Company's side is Nexvelon Integrated Solutions Inc. No affiliate, parent, subsidiary, director, officer, employee, or agent is a party to this Agreement or assumes any obligation under it.
1.2 Licensed trade name. "Nexvelon Global" is a registered business name owned by Nexvelon Inc. and used by Nexvelon Integrated Solutions Inc. under a non-exclusive licence. Use of the "Nexvelon Global" name and brand is for identification and marketing only and does not make Nexvelon Inc. or any affiliate a party to, or liable under, this Agreement.
1.3 Separate entities. Nexvelon Inc. (the parent holding company), Nexvelon Integrated Solutions Inc., and Nexvelon Guardian Inc. are separate and independent legal entities, each separately incorporated, insured, banked, and operated, and each responsible only for its own obligations. Common ownership, common branding, or common directorship does not make them a single enterprise, partnership, joint venture, or alter ego of one another.
1.4 No cross-recourse. A claim against Nexvelon Integrated Solutions Inc. is not a claim against any affiliate or the parent, and the Client has no right of recourse against Nexvelon Inc. or Nexvelon Guardian Inc. for the obligations of Nexvelon Integrated Solutions Inc. under this Agreement.

2. Nature of Services — Scope and Limitation
2.1 Physical security and low-voltage work only. Nexvelon provides physical security systems design, project management, systems integration, and the supply, installation, programming, commissioning, and servicing of low-voltage and extra-low-voltage security systems, and, where the Client purchases it, video (CCTV) monitoring as described in Section 3. Nexvelon does not provide information technology services, network security, cybersecurity consulting, or any related IT services.
2.2 Not a licensed electrical contractor. Nexvelon performs low-voltage and extra-low-voltage work only and is not a licensed electrical contractor. All line-voltage electrical work (120 volts and above), including dedicated circuits, primary power supply, panel work, and any connection to building mains, must be performed by a licensed electrician engaged by the Client at the Client's expense and in compliance with the Ontario Electrical Safety Code and Electrical Safety Authority (ESA) requirements. Nexvelon's quotation excludes all such line-voltage electrical work unless expressly stated otherwise in writing.
2.3 No consultancy relationship. Nexvelon is not a security consultant, advisor, or independent professional consultant of any kind. Nothing in this Agreement, and no drawing, design, proposal, recommendation, or communication, is to be treated as professional consultancy advice or as creating a consultancy relationship.
2.4 Design representations only. Any drawings, schematics, layouts, or riser diagrams describe a proposed method of installation and configuration based on information available when prepared. They are working documents to assist installation by qualified personnel, not certified engineering drawings or guaranteed security solutions.
2.5 Best-efforts standard. All services are provided to the best of the Company's knowledge, skill, and ability based on the information supplied by the Client and conditions known at the time. Nexvelon makes no warranty that any system will prevent, detect, or respond to every possible threat, intrusion, breach, or incident.
2.6 Client responsibility for comprehensive security. A physical security system is only one part of a complete strategy. Where the Client requires a security risk assessment, professional security consulting, cybersecurity or IT/network security, independent verification of system adequacy, or compliance with specific regulatory or insurance requirements, the Client must independently engage qualified, licensed professionals. Nexvelon accepts no responsibility for any aspect of security outside the specific scope of work in the applicable proposal or work order.
2.7 No guarantee of outcomes. Security systems are deterrents and detection tools; effectiveness depends on factors outside Nexvelon's control, including Client use, maintenance, network environment, and the nature of the threat. Nexvelon does not guarantee that any system will prevent loss, theft, damage, unauthorized access, or any other incident.
2.8 Client's final selection. While encouraged to follow Nexvelon's recommendations on the type, quantity, and placement of protection, the Client is solely responsible for the final selection of the protection it wishes to put in place.
2.9 Reliance on Client information. Designs and proposals are prepared on the basis of information, measurements, and site conditions provided by or for the Client. Nexvelon accepts no liability for errors arising from incomplete, inaccurate, or misleading Client information.

3. Monitoring and Surveillance Services
3.1 Fire alarm, elevator, and intrusion monitoring (by affiliate). Nexvelon Integrated Solutions Inc. does not provide ULC fire alarm signal monitoring, elevator monitoring, or intrusion-alarm signal monitoring. Those monitoring services are provided by Nexvelon Guardian Inc., a separate and independently operated affiliate, under a separate monitoring agreement entered into directly between the Client and Nexvelon Guardian Inc. Nexvelon Integrated Solutions Inc. is not a party to that agreement and assumes no liability of any kind for those services, including any failure, delay, or error in signal receipt, monitoring, or response. Nexvelon may refer the Client to Nexvelon Guardian Inc. for such services; any referral does not change the separate-entity structure described in Section 1.
3.2 Video (CCTV) monitoring provided by Nexvelon. Where the Client purchases video or CCTV monitoring or remote video surveillance, that service is provided by Nexvelon Integrated Solutions Inc. under these Terms (the "Video Monitoring Service"). The Video Monitoring Service is a detection-and-notification service only: video events are received or reviewed and the Client or its designated contacts or authorities are notified according to the agreed procedure. It is not a guarantee against loss and does not replace on-site security, alarm response, or emergency services.
3.3 Use of subcontractors, including outside Canada. The Client acknowledges and agrees that Nexvelon may provide the Video Monitoring Service through third-party monitoring operators, including operators located outside Canada who perform the monitoring remotely from other countries. Nexvelon remains the Client's contracting party for the Video Monitoring Service; the Client deals only with Nexvelon, and Nexvelon's monitoring operators have no direct liability to the Client.
3.4 Cross-border data transfer and privacy. To deliver the Video Monitoring Service, video images, audio, metadata, and related personal information may be transmitted to, accessed from, stored in, and processed in jurisdictions outside Canada. The Client consents to this transfer and processing and acknowledges that information handled in a foreign jurisdiction is subject to the laws of that jurisdiction, including lawful access by foreign courts, law enforcement, and government authorities. As the operator of the surveillance system (see Section 12), the Client is responsible for ensuring that its collection and use of recorded data, and the disclosure to and processing by Nexvelon's monitoring operators (including operators outside Canada), comply with the Personal Information Protection and Electronic Documents Act (PIPEDA) and other applicable privacy law, including providing any required notice, signage, and consent to individuals who may be recorded. Nexvelon will require its monitoring operators to maintain commercially reasonable confidentiality and security measures.
3.5 Service conditions. The Video Monitoring Service operates only for the cameras, zones, and hours specified in the proposal, and begins once Nexvelon confirms in writing that the system is connected, at which point the related fees begin. The Client must keep current its contact, responder, and escalation lists, authorized persons, monitored zones, and incident procedures, and must maintain a reliable power and internet or communication path. Nexvelon may suspend the Service on notice if the equipment or connectivity is not maintained and the Client does not remedy this within a reasonable time. Nexvelon may increase Video Monitoring fees at renewal on at least thirty (30) days' written notice.
3.6 Connectivity advisory. Monitoring depends on a reliable communication path. Replacing or sharing a telephone line with VoIP or similar internet telephony, or a power, internet, or modem failure, may prevent signals or video from reaching the monitoring centre. Where radio or cellular transmission is used, it is subject to CRTC and local regulation and may be impaired by atmospheric conditions, power failures, signal blockage, or other events beyond Nexvelon's control. The Client must notify Nexvelon of any change to its communication services.
3.7 Liability. The Video Monitoring Service is subject to the limitation of liability in Section 19, including the general cap and the exclusion of consequential damages. Nexvelon is not an insurer and is not liable for losses the Service is designed to detect or deter, or for the acts or omissions of any monitoring operator to the extent beyond Nexvelon's reasonable control.

4. Pricing and Payment
4.1 Prices exclusive of tax. All prices are exclusive of Harmonized Sales Tax (HST) and any other applicable sales, value-added, or transaction taxes, which will be added to invoices and remitted in accordance with applicable law.
4.2 Pricing adjustment. Nexvelon may increase the amount owing to reflect cost increases, or additional amounts it incurs from new or increased taxes, duties, tariffs, or governmental charges taking effect after the Client signs the applicable proposal.
4.3 Payment term. Each invoice is payable within the payment term selected on the applicable proposal. The selected term may be shorter, but in no case will it exceed thirty (30) days from the invoice date; net thirty (30) days is the maximum payment term offered.
4.4 Interest on late payment. Any invoice not paid within the selected payment term (and in any event within thirty (30) days of the invoice date) accrues interest at 2.5% per month (30% per annum) from the due date until paid in full.
4.5 Credit-card surcharge. A surcharge of 2.5% plus applicable taxes applies to any payment made by credit card.
4.6 Material orders. For all material orders, 70% of the total material cost is payable in advance; the remaining 30% is due immediately upon receipt. Once Nexvelon receives the ordered parts, the remaining balance is due immediately. Nexvelon will send an email with photographs of the received items, which the Client accepts as proof of receipt for collecting that balance.
4.7 Direct-to-site delivery. If the Client elects to have parts delivered directly to site, the Client must pay 100% of those parts' cost in advance and is responsible for storing them securely and maintaining a sign-in/sign-out log of all parts removed by any person. This log is the reference for accountability if any items are missing or lost on site.

5. Delivery and Materials
5.1 Receipt of deliveries. When parts or materials are out for delivery, the Client must ensure a designated contact is available to receive them in accordance with the delivery company's schedule and time window. If the assigned contact is unreachable, or a delivery is returned for any reason attributable to the Client, all costs associated with that delivery — including any re-delivery — are payable by the Client.
5.2 Parts availability and discontinuation. Timely availability of parts can be guaranteed only where 100% payment for all parts has been made in advance. If a project is delayed by days, weeks, months, or years — during or after which an ordered part becomes discontinued — no refund will be issued for parts already ordered. Where updated or replacement parts are required, the Client is responsible for the additional cost.
5.3 Ordering and availability tied to the material deposit. Parts and materials are not ordered until the required material deposit (70% of the material cost) is received. Estimated delivery times and confirmation of parts availability are provided only after that deposit is received; any timeline indicated before the deposit is received is preliminary and not a commitment.
5.4 Delayed payment, discontinuation, and substitution. If the material deposit, or any other payment required to proceed, is delayed — including until the middle or end of the project — the originally quoted parts may by then be unavailable, back-ordered, or discontinued. In that event, alternative parts that are then available will be substituted, the Client is responsible for any resulting additional cost, and the Company is not liable for any delay in delivery or completion caused by the delayed payment or by the unavailability or discontinuation of the originally quoted parts.
5.5 Vendor availability and equivalent substitution. At any stage, quoted or approved parts may become unavailable from the Company's vendors. In that event, the Company may supply other parts of similar specification and function in their place, and is not liable for any delivery delay arising from such unavailability or substitution.

6. Permits, Approvals, and Electrical Work
6.1 Permits and approvals. Unless expressly stated in the proposal, the Client is responsible for obtaining and paying for all permits, inspections, and approvals required for the work, including approvals of any authority having jurisdiction (AHJ), fire department, or electrical authority. Nexvelon will reasonably cooperate with the Client's permitting efforts.
6.2 Electrical work by others. As set out in Section 2.2, all line-voltage electrical work must be performed by the Client's licensed electrician. Nexvelon is not responsible for delays, defects, or non-compliance arising from electrical work performed by others, or from inadequate or non-code-compliant power supplied to the equipment.
6.3 Concealed and hazardous conditions. Nexvelon's pricing assumes normal, safe, and accessible site conditions. Concealed conditions (such as hidden wiring, structural obstructions, or inaccessible pathways) and hazardous materials (such as asbestos, mould, or contaminated materials) are excluded. If encountered, Nexvelon may stop affected work and the matter will be handled as a Change Order; the Client is responsible for the lawful identification, handling, and remediation of hazardous materials.

7. Change Orders and Additional Work
7.1 Changes in writing. Any change to the scope, design, quantities, schedule, or site conditions is handled as a written Change Order describing the change and its price and schedule impact. Work on a Change Order proceeds once authorized by the Client.
7.2 Additional services. Any service or equipment Nexvelon provides beyond the obligations in the applicable proposal is optional on Nexvelon's part and billable at Nexvelon's prevailing rates on terms agreed in advance.

8. Site Access and Conditions
Nexvelon will install equipment in a workmanlike manner, subject to: (a) the Client making the premises available without interruption during normal working hours (8:00 a.m. to 5:00 p.m., Monday to Friday, excluding holidays) or at other agreed times; (b) installation possibly requiring drilling and leaving some low-voltage wiring exposed; (c) the Client providing sufficient and code-compliant electrical outlets and power for equipment requiring AC power; and (d) the Client warranting that it has requested the equipment for its own use, owns the premises or has authority to engage Nexvelon, and will comply with all applicable laws and codes.

9. Risk of Loss and General Contractor Responsibility
9.1 Transfer of risk on installation. Upon physical installation of any device(s) or parts, all risk of loss or damage — including theft, vandalism, site accidents, or defacement (such as paint, plaster, or chemical contamination) caused by other trades, and regardless of whether the cause or responsible party is identified — passes immediately to the General Contractor (GC). The GC is responsible for maintaining the physical and aesthetic integrity of all installed equipment until final project handover. Following Nexvelon's submission of installation photos confirming a clean and functional state, any subsequent cleaning, repair, or replacement is a billable Change Order at Nexvelon's standard rates.
9.2 Deemed acceptance (four-hour window). Upon submission of installation photos to the GC by email or digital platform, the GC has four (4) business hours to inspect and dispute the condition of the equipment. In the absence of a written dispute within that window, the equipment is "Deemed Accepted" in clean and functional condition, and all risk of loss, theft, or defacement passes immediately to the GC.
9.3 Site supervision and assignment of responsibility.
(1) Immediate obligation. Upon signing the applicable proposal, the Client (Owner) assumes all responsibilities of the "General Contractor" or "Constructor" regarding site security, hardware protection, and installation sign-offs, unless a third-party GC is formally appointed.
(2) Duty to inform. The Client is strictly responsible for immediately communicating all terms of this Agreement — in particular those concerning equipment protection, photo-documentation, and the "Deemed Acceptance" protocol — to any current or future GC, Project Manager, or site supervisor before that party begins work.
(3) Continuous liability. If the Client changes the GC or appoints a new responsible party at any stage (including long-lead projects beginning more than a year later), the Client remains responsible for ensuring the successor party acknowledges and adheres to these terms.
(4) Indemnity for communication failure. If the Client fails to properly inform the GC or responsible site parties of these requirements, the Client remains solely and personally liable for any theft, vandalism, or defacement of Nexvelon's equipment, regardless of which trade caused the damage.

10. Commissioning, Acceptance, and Training
10.1 Commissioning and acceptance. Upon completion, Nexvelon will commission and test the system. The system is deemed accepted when the Client confirms acceptance in writing, or uses the system in the ordinary course, or fails to identify a genuine deficiency in writing within seven (7) days of commissioning, whichever occurs first.
10.2 Reporting of deficiencies. Any deficiency, or any error in delivery or installation, must be reported in writing within seven (7) days of being observed; otherwise the Client is deemed satisfied with the equipment, its delivery, and its installation.
10.3 Training — one session per system. Nexvelon provides one (1) complete training session per installed system, given to the Client at the time of commissioning or handover. Upon completion or written sign-off of that session, the Client is deemed trained on that system.
10.4 Additional training is billable. Any additional, repeat, or supplementary training — including where Client personnel change, where the Client does not retain or understand the initial training, or where further instruction on system operation is requested — is a billable service at Nexvelon's prevailing rates.

11. Equipment — Care, Title, and Software
11.1 Care of equipment. The Client must keep the equipment in good working order and, for wireless or battery-operated devices, replace batteries per recommendations or allow Nexvelon to do so at the Client's expense. The Client is responsible for regularly checking the equipment's condition and reporting deficiencies. The Client must not modify, replace, or connect other equipment in any way that impairs operation, must preserve identification plates and markings, and — if it relocates — remains responsible for the equipment and for arranging and paying for reinstallation.
11.2 Title and security interest. Title to all equipment remains with Nexvelon until paid for in full. The Client grants Nexvelon a purchase-money security interest in the equipment until paid in full and consents to Nexvelon registering its interest under the Personal Property Security Act (Ontario). Until paid in full, the Client will not encumber the equipment or permit it to be seized.
11.3 Software and firmware. Equipment may contain or rely on software and firmware that is licensed, not sold. The Client receives a non-exclusive, non-transferable licence to use such software and firmware solely to operate the equipment, and must not copy, modify, reverse-engineer, or sublicense it. All intellectual property in Nexvelon's designs, configurations, and documentation remains with Nexvelon or its licensors.

12. Surveillance Data, Recordings, and Privacy
12.1 Client is the operator. Where the system records or processes images, audio, or personal information (for example, CCTV footage or access-control logs), the Client is the operator and controller of that data and is solely responsible for its lawful collection, use, retention, disclosure, and security, including any required signage and compliance with the Personal Information Protection and Electronic Documents Act (PIPEDA) and other applicable privacy law.
12.2 Nexvelon not a custodian (except video monitoring). Other than as part of any Video Monitoring Service purchased under Section 3, Nexvelon does not retain, monitor, or take custody of the Client's recorded data, except to the limited extent reasonably necessary to install, configure, service, or troubleshoot the system, and accepts no responsibility for the Client's use of, or compliance obligations in respect of, that data.

13. Subcontractors
Nexvelon may perform any part of the work through subcontractors. The Client deals solely with Nexvelon in respect of the work, and Nexvelon's subcontractors have no direct liability to the Client. Nexvelon remains responsible for work it has subcontracted to the extent set out in this Agreement.

14. Health and Safety
Each party will comply with the Occupational Health and Safety Act (Ontario) and applicable safety requirements. Where a GC or Owner controls the site, that party is responsible for overall site safety, coordination of trades, and providing a safe work environment for Nexvelon's personnel and subcontractors.

15. Maintenance and Service
Unless a proposal states otherwise, maintenance is on-call, on a time-and-materials basis. The Client will provide access for maintenance. Replaced parts remain Nexvelon's property until paid for. Maintenance excludes, among other things: pre-existing defects not disclosed in writing and agreed in advance; defects from fire, lightning, flood, vandalism, acts of God, Client negligence, misuse, or other causes outside Nexvelon's control, or items reasonably covered by the Client's insurance; defects from Client modifications contrary to standards or recommendations; damage from paint or coatings applied to equipment; damage from electrical interruptions or spikes or from power not supplied in accordance with this Agreement; and defects from alterations by persons not authorized in advance and in writing by Nexvelon.

16. Warranty
Equipment is warranted solely per the original manufacturer's warranty. Nexvelon separately warrants that installation will be free from defects in labour for ninety (90) days following installation. Nexvelon provides no additional or extended warranty and is not responsible for registering equipment for warranty. Any manufacturer warranty period begins when Nexvelon receives the equipment, not when it is installed. A service charge at Nexvelon's prevailing rates applies where a service call is not covered by the labour warranty or arises after the labour-warranty period. All warranties other than those expressly stated here — whether express or implied, statutory or otherwise, including any implied warranty of merchantability or fitness for a particular purpose — are disclaimed to the fullest extent permitted by law.

17. Term, Renewal, and Cancellation of Service Agreements
Where the proposal includes a recurring service (such as a maintenance agreement), it renews automatically for successive terms equal to the initial term unless the Client gives written notice at least thirty (30) days before the renewal date. To cancel a recurring service before the end of its term, the Client must give at least thirty (30) days' written notice and pay, as liquidated damages and not as a penalty, an amount equal to 100% of the remaining payments for the balance of the then-current term, and cooperate with Nexvelon's right to repossess equipment not paid for. Nexvelon may terminate on thirty (30) days' written notice, refunding prepaid fees for services not yet performed. (Monitoring and surveillance services renew and are cancelled under the separate agreement between the Client and Nexvelon Guardian Inc.)

18. Default by Client
Any failure to pay amounts when due, or any other breach, entitles Nexvelon to terminate and, without waiving other remedies, to: (a) repossess any equipment not paid for, with or without notice and without obligation to repair the premises; (b) charge interest at the rate in Section 4.4 on overdue amounts; and (c) collect liquidated damages equal to 100% of the remaining payments for the balance of the then-current term of any recurring service.

19. Limitation of Liability
19.1 General. The Client releases Nexvelon from liability for losses arising, directly or indirectly, from events the equipment or services are designed to detect or avoid. Nexvelon is not an insurer; the protection provided is limited and not absolute; and the amounts payable bear no relation to the value of the premises or their contents. Nexvelon is not responsible for any loss from the failure of police, fire, ambulance, or other emergency services to respond. The Client is responsible for expenses or fines arising from false alarms. If Nexvelon is found liable, its total liability is limited, as the agreed remedy and not a penalty, to the greater of three months' service fees or $1,000. No action may be brought more than one year after the cause of action arises, unless a longer period is required by law. These limitations benefit Nexvelon's parent, subsidiary, and affiliated companies.
19.2 Cyber and IT security. Nexvelon provides physical security systems design, project management, and systems integration only, and does not provide IT, network security, or cybersecurity services. The Client acknowledges that: (a) Nexvelon has no liability of any kind for loss, damage, cost, or expense arising from cyber attacks, data breaches, network intrusions, ransomware, hacking, unauthorized digital access, or any other cyber or technology-related incident affecting the Client's systems, networks, or data; (b) any system installed may connect to or interface with the Client's network, and the Client is solely responsible for the security of its own network and IT environment; (c) where cybersecurity or IT security services are required, the Client must independently engage a qualified, licensed IT contractor, and Nexvelon accepts no responsibility for that contractor's selection, performance, or work; and (d) Nexvelon's total liability for any claim under this Agreement will not exceed the total fees paid by the Client for the specific project giving rise to the claim.
19.3 Consequential damages. In no event is Nexvelon liable for lost profits, business interruption, loss of data, or any indirect, incidental, special, or consequential damages, regardless of cause and even if advised of the possibility.

20. Compliance with Laws
Each party will comply with all applicable federal, provincial, and municipal laws, regulations, and codes in connection with this Agreement, including applicable anti-corruption, anti-bribery, and economic-sanctions laws. Each party is responsible for its own regulatory compliance and licensing for its own line of business.

21. Confidentiality and Privacy of Client Information
21.1 Confidentiality. Each party will keep confidential the other's non-public information disclosed in connection with this Agreement and use it only to perform this Agreement, except as required by law or with consent.
21.2 Client information. The Client confirms the information it provides is true and complete and will promptly notify Nexvelon of any change. For system setup, servicing, and administering the services (including credit approval, invoicing, and collection), the Client consents to Nexvelon's collection, use, and disclosure of its information among Nexvelon, its affiliates, subcontractors, and assignees, and authorizes Nexvelon to consult third parties (such as credit bureaus) regarding the Client's solvency. Such information is kept confidential and made available only to personnel who need it, unless disclosure is authorized by law. The Client has the right to access and correct its information by writing to Nexvelon, attention: Privacy Officer.

22. Dispute Resolution
The parties will first attempt in good faith to resolve any dispute through senior-level negotiation, and may agree to non-binding mediation in Ontario. Failing resolution, the dispute will be determined by the courts of the Province of Ontario, to whose jurisdiction the parties attorn. Nothing in this Section prevents a party from seeking urgent injunctive relief.

23. General
23.1 Assignment. The Client may not assign its rights without Nexvelon's prior written consent. Nexvelon may assign this Agreement or subcontract any services to another security-services provider, or to an affiliate or successor, without the Client's consent; any assignee assumes Nexvelon's obligations and benefits.
23.2 Force majeure. Nexvelon is not liable for any failure to perform caused by events outside its reasonable control, including acts of God or war, terrorism, natural disasters, pandemics, power/internet/telephone outages, transmission disruption, accidents, abuse, vandalism, the Client's failure to follow operating instructions or protect monitored areas, or any malfunction of third-party equipment, software, or firmware. Nexvelon will use commercially reasonable efforts to resume performance as soon as reasonably possible.
23.3 Notice. Notices are sent to the address on the applicable proposal and are deemed delivered on hand-delivery, one day after deposit with an overnight courier, five days after deposit by registered mail, or upon confirmed email.
23.4 No waiver. Nexvelon's failure to require performance or enforce a right is not a waiver of that right.
23.5 Entire agreement and order of precedence. This Agreement, with the applicable proposal or work order, is the entire agreement on its subject matter and supersedes all prior communications. It may be amended only by a written instrument signed by both parties, except for Change Orders as provided above. In case of conflict, an executed Change Order prevails over the proposal, and these Terms prevail over any inconsistent terms in any Client purchase order or other document. No sales representative has authority to alter these printed terms.
23.6 Severability. If any provision is found invalid or unenforceable, it is severed (or read down to the extent permitted by law) and the remaining provisions stay in full force.
23.7 Governing law and jurisdiction. This Agreement is governed by the laws of the Province of Ontario and the federal laws of Canada applicable there, and the parties attorn to the jurisdiction of the courts of Ontario.
23.8 Costs. The Client agrees to pay all costs Nexvelon incurs (including legal fees on a solicitor-and-client basis) to collect any amount owed, repossess equipment, or remedy any breach.
23.9 Currency, counterparts, and interpretation. All amounts are in Canadian dollars unless stated otherwise. This Agreement may be signed in counterparts and by electronic signature, each of which is an original. The words "include" and "including" mean "without limitation," and "days" mean calendar days unless stated as business days.`;

// G2 — Guardian (Nexvelon Guardian Inc.) default Terms. Mirrors the
// DEFAULT_TERMS plain-text format (blank lines preserved; the PDF
// AgreementPage splits on \n). Spliced via the safe temp-file technique.
export const DEFAULT_TERMS_GUARDIAN = `NEXVELON GUARDIAN INC. — Terms & Conditions

This Quote/Proposal and any resulting agreement are made with Nexvelon Guardian Inc. (Ontario Corporation No. 1001583800), carrying on business as "Nexvelon Global" (the "Company" or "Nexvelon"). The other party is the "Client" (also the "Owner" where it acts as such, or the "GC" / General Contractor where applicable). All obligations, warranties, and liabilities under this Agreement are those of Nexvelon Guardian Inc. alone.

1. Parties, Brand, and Affiliated Companies
1.1 Contracting party. The only contracting party on the Company's side is Nexvelon Guardian Inc. No affiliate, parent, subsidiary, director, officer, employee, or agent is a party to this Agreement or assumes any obligation under it.
1.2 Licensed trade name. "Nexvelon Global" is a registered business name owned by Nexvelon Inc. and used by Nexvelon Guardian Inc. under a non-exclusive licence. Use of the "Nexvelon Global" name and brand is for identification and marketing only and does not make Nexvelon Inc. or any affiliate a party to, or liable under, this Agreement.
1.3 Separate entities. Nexvelon Inc. (the parent holding company), Nexvelon Guardian Inc., and Nexvelon Integrated Solutions Inc. are separate and independent legal entities, each separately incorporated, insured, banked, and operated, and each responsible only for its own obligations. Common ownership, common branding, or common directorship does not make them a single enterprise, partnership, joint venture, or alter ego of one another.
1.4 No cross-recourse. A claim against Nexvelon Guardian Inc. is not a claim against any affiliate or the parent, and the Client has no right of recourse against Nexvelon Inc. or Nexvelon Integrated Solutions Inc. for the obligations of Nexvelon Guardian Inc. under this Agreement.
1.5 Services provided by an affiliate. General physical security systems work and video (CCTV) monitoring are provided by Nexvelon Integrated Solutions Inc., a separate affiliate, under its own separate agreement. Nexvelon Guardian Inc. may refer the Client to that affiliate; any referral does not change the separate-entity structure described in this Section and creates no liability for Nexvelon Guardian Inc. in respect of that affiliate's services.

2. Nature of Services — Scope and Limitation
2.1 What Nexvelon provides. Nexvelon provides: (a) the supply, installation, programming, commissioning, and servicing of ULC fire alarm systems and related low-voltage life-safety and security systems; and (b) signal-receiving and monitoring services, including ULC-listed fire alarm signal monitoring, elevator monitoring, and intrusion-alarm monitoring (collectively, the "Monitoring Services").
2.2 Not a licensed electrical contractor. Nexvelon performs low-voltage and extra-low-voltage work only and is not a licensed electrical contractor. All line-voltage electrical work (120 volts and above), including dedicated circuits, primary power supply, panel work, and any connection to building mains, must be performed by a licensed electrician engaged by the Client at the Client's expense and in compliance with the Ontario Electrical Safety Code and Electrical Safety Authority (ESA) requirements. Nexvelon's quotation excludes all such line-voltage electrical work unless expressly stated otherwise in writing.
2.3 Detection and notification only. The Monitoring Services are a detection-and-notification service: signals are received and processed and the Client or its designated contacts or authorities are notified according to the agreed procedure. The Monitoring Services are not a guarantee against loss and do not replace on-site security, alarm response, or emergency services. Nexvelon is not an insurer (see Section 22).
2.4 No consultancy relationship. Nexvelon is not a security consultant, advisor, or independent professional consultant of any kind. Nothing in this Agreement, and no drawing, design, proposal, recommendation, or communication, is to be treated as professional consultancy advice or as creating a consultancy relationship.
2.5 Design representations only. Any drawings, schematics, layouts, or riser diagrams describe a proposed method of installation and configuration based on information available when prepared. They are working documents to assist installation by qualified personnel, not certified engineering drawings or guaranteed security solutions.
2.6 Best-efforts standard. All services are provided to the best of the Company's knowledge, skill, and ability based on the information supplied by the Client and conditions known at the time. Nexvelon makes no warranty that any system or service will prevent, detect, or respond to every possible threat, intrusion, fire, breach, or incident.
2.7 Client responsibility for comprehensive security. A monitored system is only one part of a complete strategy. Where the Client requires a security or fire risk assessment, professional consulting, cybersecurity or IT/network security, independent verification of system adequacy, or compliance with specific regulatory or insurance requirements, the Client must independently engage qualified, licensed professionals. Nexvelon accepts no responsibility for any aspect of security or life safety outside the specific scope of work in the applicable proposal or work order.
2.8 No guarantee of outcomes. Monitored systems are detection and notification tools; effectiveness depends on factors outside Nexvelon's control, including Client use, maintenance, the communication path, responder availability, and the nature of the event. Nexvelon does not guarantee that any system or service will prevent loss, theft, fire, damage, injury, unauthorized access, or any other incident.
2.9 Client's final selection. While encouraged to follow Nexvelon's recommendations on the type, quantity, and placement of protection, the Client is solely responsible for the final selection of the protection it wishes to put in place.
2.10 Reliance on Client information. Designs, proposals, and monitoring procedures are prepared on the basis of information provided by or for the Client. Nexvelon accepts no liability for errors arising from incomplete, inaccurate, or outdated Client information.

3. Monitoring Services
3.1 Commencement and operation. The Monitoring Services begin once Nexvelon confirms in writing that the system is connected and active, at which point the related fees begin, and operate for the signals, zones, and hours specified in the proposal. Nexvelon (or its monitoring station) will process signals received from the Client's equipment and notify the Client or designated contacts or authorities according to the agreed procedure.
3.2 Signal verification. The Client authorizes Nexvelon to attempt to verify signals received from the premises before dispatching or requesting authorities or emergency services. Nexvelon is not liable for any loss, damage, or personal injury sustained as a result of such verification or attempted verification, or for any resulting delay.
3.3 Communication path. The Monitoring Services depend on a reliable communication path between the Client's equipment and the monitoring station, which may use a digital connection over the Client's telephone line, radio or cellular (GSM) transmission, internet protocol (IP), or a combination. The Client is responsible for the connectivity and for any charges, installation, or repair needed to connect and keep the system connected.
3.4 Communication-path advisory. The Client acknowledges that: (a) replacing or sharing a telephone line with VoIP or similar internet telephony may prevent signals from reaching the monitoring station, and the Client must notify Nexvelon of any such change so an inspection or modification can be scheduled at the Client's expense; (b) a power, internet, or modem failure may prevent signals from being transmitted; and (c) where radio or cellular transmission is used, it is subject to CRTC and local regulation and may be impaired by atmospheric conditions, power failures, signal blockage, network changes, or other events beyond Nexvelon's control. For radio/cellular service, the Client may select either 24-hour or accelerated (for example, ~90-second) supervision check-in as set out in the proposal, at the corresponding fee.
3.5 Monitoring stations and subcontractors. Nexvelon may provide the Monitoring Services through its own monitoring centre or through ULC-listed third-party or affiliated monitoring stations. Nexvelon remains the Client's contracting party for the Monitoring Services; the Client deals only with Nexvelon, and Nexvelon's monitoring operators have no direct liability to the Client.
3.6 Cross-border processing (where applicable). If any monitoring or data processing is performed outside Canada, signal data and related personal information may be transmitted to, accessed from, stored in, or processed in jurisdictions outside Canada, and the Client consents to this transfer and processing and acknowledges that information handled in a foreign jurisdiction is subject to the laws of that jurisdiction, including lawful access by foreign authorities. Nexvelon will require its monitoring operators to maintain commercially reasonable confidentiality and security measures.
3.7 Maintenance and suspension. Regular maintenance and inspection are recommended. Nexvelon may suspend the Monitoring Services on notice if the equipment or communication path is not maintained and the Client does not remedy this within a reasonable time.
3.8 Client responsibilities. The Client must keep current its responder, keyholder, and escalation lists, authorized persons, monitored zones, and incident procedures, and must maintain a reliable power and communication path. Nexvelon acts on the most current information the Client has provided.

4. Dispatch and False Alarms
4.1 Dispatch authorization. The Client authorizes Nexvelon, following an alarm event and any verification, to request dispatch of police, fire, ambulance, or other authorities or emergency services in accordance with the agreed response protocol. The Client confirms its dispatch elections by initialling the applicable services on the proposal or response form.
4.2 Regional false-alarm fees. Municipal and regional police, fire, and emergency services impose false-alarm, cancelled-alarm, registration, and related fees that vary by region and change over time. The Client is solely responsible for all such fees and fines, and acknowledges that, in some regions, police or other services will not respond unless the Client has acknowledged or accepted the applicable fees. Nexvelon's current regional fee schedule, where provided, is set out in a schedule to the proposal and may change without notice as authorities revise their fees.
4.3 Dispatch election. The Client elects either: (a) to accept the applicable regional police-dispatch fees and authorize dispatch accordingly; or (b) to decline police dispatch and rely instead on keyholder and/or private security guard response, in which case the Client acknowledges materially longer response times than typical police response and agrees to pay for any private guard response at the applicable rate.
4.4 No liability for response. Nexvelon is not responsible for the response, non-response, conduct, or timing of any police, fire, ambulance, other authority, or private guard, or for any false-alarm fees or fines, all of which are the Client's responsibility.

5. Keyholders and Response Protocol
The Client must provide and keep current a keyholder / pass-card list and a response priority sequence (for example, for burglar, fire, duress, and medical events). Nexvelon acts on the most current list provided by the Client. The Client is solely responsible for the accuracy and currency of the list, for designating who is authorized to make changes to it, and for promptly notifying Nexvelon of changes. Additional or replacement pass cards, or changes after installation, may carry a service charge. Personal information of keyholders and contacts is handled in accordance with Section 24.

6. Pricing and Payment
6.1 Prices exclusive of tax. All prices are exclusive of Harmonized Sales Tax (HST) and any other applicable sales, value-added, or transaction taxes, which will be added to invoices and remitted in accordance with applicable law.
6.2 Pricing adjustment. Nexvelon may increase the amount owing to reflect cost increases, or additional amounts it incurs from new or increased taxes, duties, tariffs, or governmental charges taking effect after the Client signs the applicable proposal. Nexvelon may increase recurring Monitoring Service fees at renewal on at least thirty (30) days' written notice.
6.3 Annual billing in advance. Monitoring Service fees are billed annually in advance; the full year's fee is charged in a single payment at the start of each annual term.
6.4 Pre-authorized payment required. The Client must enrol in and maintain a pre-authorized payment method — pre-authorized debit (PAD) from a bank account or automatic charges to a credit card — and authorizes Nexvelon to charge the annual fee (and any applicable taxes and approved charges) to that method in advance of each annual term. Nexvelon will provide written notice of the amount and the charge date at least thirty (30) days before each annual pre-authorized charge.
6.5 Changes and declines. The Client may cancel or change its pre-authorized payment method on written notice in accordance with the authorization terms; the account will then revert to direct billing. If a pre-authorized charge is declined or returned, the account may revert to direct billing and the outstanding amount accrues interest under Section 6.8. The Client remains responsible for the full annual fee notwithstanding any cancellation, change, or decline.
6.6 Payment term for invoiced amounts. For any amount that is invoiced rather than pre-authorized (for example, installation, equipment, or service work), payment is due within the term selected on the applicable proposal, which in no case will exceed thirty (30) days from the invoice date; net thirty (30) days is the maximum payment term offered.
6.7 Material orders. For all material orders, 70% of the total material cost is payable in advance; the remaining 30% is due immediately upon receipt. Once Nexvelon receives the ordered parts, the remaining balance is due immediately. Nexvelon will send an email with photographs of the received items, which the Client accepts as proof of receipt for collecting that balance.
6.8 Interest on late payment. Any amount not paid when due accrues interest at 2.5% per month (30% per annum) from the due date until paid in full.
6.9 Credit-card surcharge. A surcharge of 2.5% plus applicable taxes applies to any payment made by credit card.
6.10 Direct-to-site delivery. If the Client elects to have parts delivered directly to site, the Client must pay 100% of those parts' cost in advance and is responsible for storing them securely and maintaining a sign-in/sign-out log of all parts removed by any person. This log is the reference for accountability if any items are missing or lost on site.

7. Delivery and Materials
7.1 Receipt of deliveries. When parts or materials are out for delivery, the Client must ensure a designated contact is available to receive them in accordance with the delivery company's schedule and time window. If the assigned contact is unreachable, or a delivery is returned for any reason attributable to the Client, all costs associated with that delivery — including any re-delivery — are payable by the Client.
7.2 Parts availability and discontinuation. Timely availability of parts can be guaranteed only where 100% payment for all parts has been made in advance. If a project is delayed by days, weeks, months, or years — during or after which an ordered part becomes discontinued — no refund will be issued for parts already ordered. Where updated or replacement parts are required, the Client is responsible for the additional cost.
7.3 Ordering and availability tied to the material deposit. Parts and materials are not ordered until the required material deposit (70% of the material cost) is received. Estimated delivery times and confirmation of parts availability are provided only after that deposit is received; any timeline indicated before the deposit is received is preliminary and not a commitment.
7.4 Delayed payment, discontinuation, and substitution. If the material deposit, or any other payment required to proceed, is delayed — including until the middle or end of the project — the originally quoted parts may by then be unavailable, back-ordered, or discontinued. In that event, alternative parts that are then available will be substituted, the Client is responsible for any resulting additional cost, and the Company is not liable for any delay in delivery or completion caused by the delayed payment or by the unavailability or discontinuation of the originally quoted parts.
7.5 Vendor availability and equivalent substitution. At any stage, quoted or approved parts may become unavailable from the Company's vendors. In that event, the Company may supply other parts of similar specification and function in their place, and is not liable for any delivery delay arising from such unavailability or substitution.

8. Permits, Approvals, and Electrical Work
8.1 Permits and approvals. Unless expressly stated in the proposal, the Client is responsible for obtaining and paying for all permits, inspections, and approvals required for the work, including approvals of any authority having jurisdiction (AHJ), fire department, or electrical authority. Nexvelon will reasonably cooperate with the Client's permitting efforts.
8.2 Electrical work by others. As set out in Section 2.2, all line-voltage electrical work must be performed by the Client's licensed electrician. Nexvelon is not responsible for delays, defects, or non-compliance arising from electrical work performed by others, or from inadequate or non-code-compliant power supplied to the equipment.
8.3 Concealed and hazardous conditions. Nexvelon's pricing assumes normal, safe, and accessible site conditions. Concealed conditions (such as hidden wiring, structural obstructions, or inaccessible pathways) and hazardous materials (such as asbestos, mould, or contaminated materials) are excluded. If encountered, Nexvelon may stop affected work and the matter will be handled as a Change Order; the Client is responsible for the lawful identification, handling, and remediation of hazardous materials.

9. Change Orders and Additional Work
9.1 Changes in writing. Any change to the scope, design, quantities, schedule, or site conditions is handled as a written Change Order describing the change and its price and schedule impact. Work on a Change Order proceeds once authorized by the Client.
9.2 Additional services. Any service or equipment Nexvelon provides beyond the obligations in the applicable proposal is optional on Nexvelon's part and billable at Nexvelon's prevailing rates on terms agreed in advance.

10. Site Access and Conditions
Nexvelon will install equipment in a workmanlike manner, subject to: (a) the Client making the premises available without interruption during normal working hours (8:00 a.m. to 5:00 p.m., Monday to Friday, excluding holidays) or at other agreed times; (b) installation possibly requiring drilling and leaving some low-voltage wiring exposed; (c) the Client providing sufficient and code-compliant electrical outlets and power for equipment requiring AC power; and (d) the Client warranting that it has requested the equipment for its own use, owns the premises or has authority to engage Nexvelon, and will comply with all applicable laws and codes.

11. Risk of Loss and General Contractor Responsibility
11.1 Transfer of risk on installation. Upon physical installation of any device(s) or parts, all risk of loss or damage — including theft, vandalism, site accidents, or defacement (such as paint, plaster, or chemical contamination) caused by other trades, and regardless of whether the cause or responsible party is identified — passes immediately to the General Contractor (GC). The GC is responsible for maintaining the physical and aesthetic integrity of all installed equipment until final project handover. Following Nexvelon's submission of installation photos confirming a clean and functional state, any subsequent cleaning, repair, or replacement is a billable Change Order at Nexvelon's standard rates.
11.2 Deemed acceptance (four-hour window). Upon submission of installation photos to the GC by email or digital platform, the GC has four (4) business hours to inspect and dispute the condition of the equipment. In the absence of a written dispute within that window, the equipment is "Deemed Accepted" in clean and functional condition, and all risk of loss, theft, or defacement passes immediately to the GC.
11.3 Site supervision and assignment of responsibility.
(1) Immediate obligation. Upon signing the applicable proposal, the Client (Owner) assumes all responsibilities of the "General Contractor" or "Constructor" regarding site security, hardware protection, and installation sign-offs, unless a third-party GC is formally appointed.
(2) Duty to inform. The Client is strictly responsible for immediately communicating all terms of this Agreement — in particular those concerning equipment protection, photo-documentation, and the "Deemed Acceptance" protocol — to any current or future GC, Project Manager, or site supervisor before that party begins work.
(3) Continuous liability. If the Client changes the GC or appoints a new responsible party at any stage (including long-lead projects beginning more than a year later), the Client remains responsible for ensuring the successor party acknowledges and adheres to these terms.
(4) Indemnity for communication failure. If the Client fails to properly inform the GC or responsible site parties of these requirements, the Client remains solely and personally liable for any theft, vandalism, or defacement of Nexvelon's equipment, regardless of which trade caused the damage.

12. Commissioning, Acceptance, and Training
12.1 Commissioning and acceptance. Upon completion, Nexvelon will commission and test the system. The system is deemed accepted when the Client confirms acceptance in writing, or uses the system in the ordinary course, or fails to identify a genuine deficiency in writing within seven (7) days of commissioning, whichever occurs first.
12.2 Reporting of deficiencies. Any deficiency, or any error in delivery or installation, must be reported in writing within seven (7) days of being observed; otherwise the Client is deemed satisfied with the equipment, its delivery, and its installation.
12.3 Training — one session per system. Nexvelon provides one (1) complete training session per installed system, given to the Client at the time of commissioning or handover. Upon completion or written sign-off of that session, the Client is deemed trained on that system.
12.4 Additional training is billable. Any additional, repeat, or supplementary training — including where Client personnel change, where the Client does not retain or understand the initial training, or where further instruction on system operation is requested — is a billable service at Nexvelon's prevailing rates.

13. Equipment — Care, Title, and Software
13.1 Care of equipment. The Client must keep the equipment in good working order and, for wireless or battery-operated devices, replace batteries per recommendations or allow Nexvelon to do so at the Client's expense. The Client is responsible for regularly checking the equipment's condition and reporting deficiencies. The Client must not modify, replace, or connect other equipment in any way that impairs operation, must preserve identification plates and markings, and — if it relocates — remains responsible for the equipment and for arranging and paying for reinstallation.
13.2 Title and security interest. Title to all equipment remains with Nexvelon until paid for in full. The Client grants Nexvelon a purchase-money security interest in the equipment (and in any leased equipment) until paid in full or the lease ends, and consents to Nexvelon registering its interest under the Personal Property Security Act (Ontario). Until paid in full, the Client will not encumber the equipment or permit it to be seized.
13.3 Software and firmware. Equipment may contain or rely on software and firmware that is licensed, not sold. The Client receives a non-exclusive, non-transferable licence to use such software and firmware solely to operate the equipment, and must not copy, modify, reverse-engineer, or sublicense it. All intellectual property in Nexvelon's designs, configurations, and documentation remains with Nexvelon or its licensors.

14. ULC Compliance and Certificates
Where a ULC-listed service or certificate is required, it is issued and maintained subject to ULC standards, the Client's continued compliance, and Nexvelon's then-current fees. Annual ULC inspections (and any re-inspections) are required to keep a ULC certificate valid and are billed separately at Nexvelon's then-current rate; they are not included in the monitoring fee unless expressly stated. The Client must maintain the system, provide access for inspections, and remedy deficiencies; failure to do so, or any lapse in required fees or inspections, may suspend or void the ULC certificate, and Nexvelon is not responsible for the consequences of such a lapse.

15. Monitoring Data and Privacy
15.1 Client is the operator. Where the system records or processes signals, images, audio, or personal information, the Client is the operator and controller of that data and is responsible for its lawful collection, use, retention, disclosure, and security, including any required signage and compliance with the Personal Information Protection and Electronic Documents Act (PIPEDA) and other applicable privacy law.
15.2 Use for the services. Nexvelon and its monitoring operators handle signal and contact data only to the extent reasonably necessary to provide the Monitoring Services, administer the account, and meet legal requirements, and will maintain commercially reasonable confidentiality and security measures.

16. Subcontractors
Nexvelon may perform any part of the work or the Monitoring Services through subcontractors or monitoring operators. The Client deals solely with Nexvelon, and Nexvelon's subcontractors and operators have no direct liability to the Client. Nexvelon remains responsible for work it has subcontracted to the extent set out in this Agreement.

17. Health and Safety
Each party will comply with the Occupational Health and Safety Act (Ontario) and applicable safety requirements. Where a GC or Owner controls the site, that party is responsible for overall site safety, coordination of trades, and providing a safe work environment for Nexvelon's personnel and subcontractors.

18. Maintenance and Service
Unless a proposal states otherwise, maintenance is on-call, on a time-and-materials basis. The Client will provide access for maintenance. Replaced parts remain Nexvelon's property until paid for. Maintenance excludes, among other things: pre-existing defects not disclosed in writing and agreed in advance; defects from fire, lightning, flood, vandalism, acts of God, Client negligence, misuse, or other causes outside Nexvelon's control, or items reasonably covered by the Client's insurance; defects from Client modifications contrary to standards or recommendations; damage from paint or coatings applied to equipment; damage from electrical interruptions or spikes or from power not supplied in accordance with this Agreement; and defects from alterations by persons not authorized in advance and in writing by Nexvelon.

19. Warranty
Equipment is warranted solely per the original manufacturer's warranty. Nexvelon separately warrants that installation will be free from defects in labour for ninety (90) days following installation. Nexvelon provides no additional or extended warranty and is not responsible for registering equipment for warranty. Any manufacturer warranty period begins when Nexvelon receives the equipment, not when it is installed. A service charge at Nexvelon's prevailing rates applies where a service call is not covered by the labour warranty or arises after the labour-warranty period. All warranties other than those expressly stated here — whether express or implied, statutory or otherwise, including any implied warranty of merchantability or fitness for a particular purpose — are disclaimed to the fullest extent permitted by law.

20. Term, Renewal, and Cancellation
The Monitoring Services renew automatically for successive one-year terms unless the Client gives written notice at least thirty (30) days before the renewal date. To cancel the Monitoring Services or any recurring service before the end of its term, the Client must give at least thirty (30) days' written notice and pay, as liquidated damages and not as a penalty, an amount equal to 100% of the remaining payments for the balance of the then-current term, and cooperate with Nexvelon's right to repossess equipment not paid for. Nexvelon may terminate on thirty (30) days' written notice, refunding the unused portion of any prepaid annual fee for services not yet performed.

21. Default by Client
Any failure to pay amounts when due, or any other breach, entitles Nexvelon to terminate and, without waiving other remedies, to: (a) repossess any equipment not paid for, with or without notice and without obligation to repair the premises; (b) charge interest at the rate in Section 6.8 on overdue amounts; (c) suspend the Monitoring Services; and (d) collect liquidated damages equal to 100% of the remaining payments for the balance of the then-current term.

22. Limitation of Liability
22.1 General. The Client releases Nexvelon from liability for losses arising, directly or indirectly, from events the equipment or services are designed to detect or avoid. Nexvelon is not an insurer; the protection provided is limited and not absolute; and the amounts payable bear no relation to the value of the premises or their contents. Nexvelon is not responsible for any loss from the failure of police, fire, ambulance, or other emergency services, or any private guard, to respond. The Client is responsible for expenses or fines arising from false alarms. If Nexvelon is found liable, its total liability is limited, as the agreed remedy and not a penalty, to the greater of three months' Monitoring Service fees or $1,000. No action may be brought more than one year after the cause of action arises, unless a longer period is required by law. These limitations benefit Nexvelon's parent, subsidiary, and affiliated companies.
22.2 Cyber and IT security. Nexvelon does not provide IT, network security, or cybersecurity services. The Client acknowledges that: (a) Nexvelon has no liability for loss arising from cyber attacks, data breaches, network intrusions, ransomware, hacking, unauthorized digital access, or any other cyber or technology-related incident affecting the Client's systems, networks, or data; (b) any system installed may connect to or interface with the Client's network, and the Client is solely responsible for the security of its own network and IT environment; (c) where cybersecurity or IT security services are required, the Client must independently engage a qualified, licensed IT contractor; and (d) Nexvelon's total liability for any claim under this Agreement will not exceed the total fees paid by the Client for the specific project or twelve months of Monitoring Service fees, whichever is greater, giving rise to the claim.
22.3 Consequential damages. In no event is Nexvelon liable for lost profits, business interruption, loss of data, or any indirect, incidental, special, or consequential damages, regardless of cause and even if advised of the possibility.

23. Compliance with Laws
Each party will comply with all applicable federal, provincial, and municipal laws, regulations, and codes in connection with this Agreement, including the Consumer Protection Act, 2002 (Ontario) where applicable, Canada's Anti-Spam Legislation (CASL) for commercial electronic messages, PIPEDA for personal information, applicable ULC standards, municipal alarm by-laws, and applicable anti-corruption, anti-bribery, and economic-sanctions laws. Each party is responsible for its own regulatory compliance and licensing for its own line of business.

24. Confidentiality and Privacy of Client Information
24.1 Confidentiality. Each party will keep confidential the other's non-public information disclosed in connection with this Agreement and use it only to perform this Agreement, except as required by law or with consent.
24.2 Client and keyholder information. The Client confirms the information it provides (including keyholder and contact information) is true, complete, and provided with any necessary consent, and will promptly notify Nexvelon of any change. For system setup, monitoring, and administering the services (including credit approval, invoicing, and collection), the Client consents to Nexvelon's collection, use, and disclosure of its information among Nexvelon, its affiliates, subcontractors, monitoring operators, and assignees, and authorizes Nexvelon to consult third parties (such as credit bureaus) regarding the Client's solvency. Such information is kept confidential and made available only to personnel who need it, unless disclosure is authorized by law. The Client has the right to access and correct its information by writing to Nexvelon, attention: Privacy Officer.

25. Dispute Resolution
The parties will first attempt in good faith to resolve any dispute through senior-level negotiation, and may agree to non-binding mediation in Ontario. Failing resolution, the dispute will be determined by the courts of the Province of Ontario, to whose jurisdiction the parties attorn. Nothing in this Section prevents a party from seeking urgent injunctive relief.

26. General
26.1 Assignment. The Client may not assign its rights without Nexvelon's prior written consent. Nexvelon may assign this Agreement or subcontract any services to another monitoring or security-services provider, or to an affiliate or successor, without the Client's consent; any assignee assumes Nexvelon's obligations and benefits.
26.2 Force majeure. Nexvelon is not liable for any failure to perform caused by events outside its reasonable control, including acts of God or war, terrorism, natural disasters, pandemics, power/internet/telephone outages, transmission disruption, accidents, abuse, vandalism, the Client's failure to follow operating instructions or protect monitored areas, or any malfunction of third-party equipment, software, or firmware. Nexvelon will use commercially reasonable efforts to resume performance as soon as reasonably possible.
26.3 Notice. Notices are sent to the address on the applicable proposal and are deemed delivered on hand-delivery, one day after deposit with an overnight courier, five days after deposit by registered mail, or upon confirmed email.
26.4 No waiver. Nexvelon's failure to require performance or enforce a right is not a waiver of that right.
26.5 Entire agreement and order of precedence. This Agreement, with the applicable proposal or work order, is the entire agreement on its subject matter and supersedes all prior communications. It may be amended only by a written instrument signed by both parties, except for Change Orders as provided above. In case of conflict, an executed Change Order prevails over the proposal, and these Terms prevail over any inconsistent terms in any Client purchase order or other document. No sales representative has authority to alter these printed terms.
26.6 Severability. If any provision is found invalid or unenforceable, it is severed (or read down to the extent permitted by law) and the remaining provisions stay in full force.
26.7 Governing law and jurisdiction. This Agreement is governed by the laws of the Province of Ontario and the federal laws of Canada applicable there, and the parties attorn to the jurisdiction of the courts of Ontario.
26.8 Costs. The Client agrees to pay all costs Nexvelon incurs (including legal fees on a solicitor-and-client basis) to collect any amount owed, repossess equipment, or remedy any breach.
26.9 Currency, counterparts, and interpretation. All amounts are in Canadian dollars unless stated otherwise. This Agreement may be signed in counterparts and by electronic signature, each of which is an original. The words "include" and "including" mean "without limitation," and "days" mean calendar days unless stated as business days.`;

// Per-entity default Terms, keyed by quote template slug. New quotes seed
// from the selected template's entry; consumers fall back to these in-code
// values when the admin-managed settings values are unset.
export const DEFAULT_TERMS_BY_TEMPLATE: Record<QuoteTemplateSlug, string> = {
  integrated_solutions: DEFAULT_TERMS,
  guardian: DEFAULT_TERMS_GUARDIAN,
};

export const SECTION_PRESETS = [
  "Access Control Hardware",
  "CCTV / Video Surveillance",
  "Intrusion Detection",
  "Intercom & Audio",
  "Networking & Power",
  "Cabling & Accessories",
  "Programming & Commissioning",
  "Labor",
];

export function newId(prefix: string = "li"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "product",
    name: "",
    description: "",
    classification: "Materials",
    qty: 1,
    unitCost: 0,
    margin: 40,
    unitPrice: 0,
  };
}

export function miscLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "misc",
    name: "",
    description: "",
    classification: "Misc",
    qty: 1,
    unitCost: 0,
    margin: 40,
    unitPrice: 0,
    // vendor, sku, productId intentionally omitted — all optional, blank by default
  };
}

export function serviceLineItem(): BuilderLineItem {
  return {
    id: newId("li"),
    type: "service",
    name: "",
    description: "",
    classification: "Warranty Cost",
    qty: 1,
    unitCost: 0,
    margin: 40,
    unitPrice: 0,
    // vendor, sku, productId intentionally omitted — all optional. Services
    // may have a 3rd-party provider; the user can fill vendor/SKU if so.
  };
}

// QUOTE-LABOUR: a managed labour line. `sellRate` prefills from the Settings
// default (app_settings.default_labour_sell_rate) and is editable per line. The
// labour metadata is what flags this as a labour line; hours mirror qty and
// sellRate mirrors unitPrice so the totals engine treats it like a part. All
// three PDF-visibility flags default OFF → the client sees only "Labour — $X".
const DEFAULT_LABOUR_HOURS = 8;
const DEFAULT_LABOUR_MARGIN = 40;

export function laborLineItem(sellRate = 145): BuilderLineItem {
  const rate = Number.isFinite(sellRate) && sellRate > 0 ? round2(sellRate) : 145;
  return {
    id: newId("li"),
    type: "labor",
    name: "",
    description: "Labour",
    classification: "Technician Labour",
    qty: DEFAULT_LABOUR_HOURS, // hours
    unitCost: round2(rate * (1 - DEFAULT_LABOUR_MARGIN / 100)), // cost rate per hour
    margin: DEFAULT_LABOUR_MARGIN,
    unitPrice: rate, // billing (sell) rate per hour
    labour: {
      hours: DEFAULT_LABOUR_HOURS,
      sellRate: rate,
      show: { description: false, hours: false, rate: false },
    },
  };
}

// Parts and labour share one model now (QB-3): qty × unitPrice / unitCost.
export function lineItemTotal(li: BuilderLineItem): number {
  return li.qty * li.unitPrice;
}

export function lineItemCost(li: BuilderLineItem): number {
  return li.qty * li.unitCost;
}

// cost / margin → unitPrice (holds the margin the user set).
export function recalcLineItem(li: BuilderLineItem): BuilderLineItem {
  const unitPrice =
    li.margin >= 100
      ? li.unitCost // guard against div-by-zero
      : round2(li.unitCost / (1 - li.margin / 100));
  return { ...li, unitPrice };
}

// BUGFIX — the reverse binding: unitPrice → margin (holds cost). Used when the
// user edits the selling price directly, so the displayed margin stays truthful
// instead of showing a stale default. Guarded against div-by-zero.
export function recalcMarginFromPrice(
  li: BuilderLineItem,
  newUnitPrice: number
): BuilderLineItem {
  const price = round2(newUnitPrice);
  const margin = price > 0 ? round2((1 - li.unitCost / price) * 100) : 0;
  return { ...li, unitPrice: price, margin };
}

export function sectionSubtotal(s: QuoteSection): number {
  return s.items.reduce((sum, li) => sum + lineItemTotal(li), 0);
}

// BUGFIX (quotes) — the former `quoteTotals` here was the second, divergent
// implementation of quote money math (it exposed margin as a 0–1 ratio and no
// cost/profit, which is how the margin display drifted). It has been removed;
// `computeQuoteTotals` in lib/quotes/totals.ts is now the single source of truth
// for subtotal/discount/tax/total AND cost/profit/margin. `sectionSubtotal`,
// `lineItemTotal`, `lineItemCost`, and `round2` below remain the shared
// primitives it builds on.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Quote number is now a Toronto-time timestamp YYMMDDHHMM (self-contained — no
// sequence lookup). The previous `existing: Quote[]` argument is no longer read,
// so the param is dropped; existing callers passing an arg (nextQuoteNumber(
// allQuotes)) still work — JS ignores the extra argument, so call sites + the
// useQuotesLoaded guard stay unchanged. The internal id (newId("q")) remains
// the unique key; minute-precision number collisions are tolerated.
export function nextQuoteNumber(): string {
  return businessQuoteNumber();
}

// Convert a flat seed quote (without sections) into a single-section
// builder shape on demand.
export function ensureSections(q: Quote): QuoteSection[] {
  if (q.sections && q.sections.length > 0) return q.sections;
  const items: BuilderLineItem[] = (q.items ?? []).map((it) => {
    const product = products.find((p) => p.id === it.productId);
    return {
      id: newId("li"),
      type: "product",
      vendor: product?.vendor,
      productId: it.productId,
      sku: product?.sku ?? "",
      name: "",
      description: product?.name ?? "Item",
      classification: defaultClassificationFor("product"),
      qty: it.qty,
      unitCost: product?.cost ?? 0,
      // Derive margin% = (price − cost) / price × 100 (QB-2 margin model)
      margin:
        product && it.unitPrice > 0
          ? round2(((it.unitPrice - product.cost) / it.unitPrice) * 100)
          : 0,
      unitPrice: it.unitPrice,
    };
  });
  return [{ id: newId("sec"), name: "Equipment & Installation", items }];
}

export const QUOTE_STATUS_ORDER: QuoteStatus[] = [
  "Draft",
  "Sent",
  "Approved",
  "Revision",
  "Closed",
  "Expired",
  "Converted",
];

// Weighted-pipeline probabilities. Revision / Closed / Expired are 0 — a
// revision is paused, a closed deal is dead, an expired quote is gone — so none
// contribute to the weighted pipeline sum.
export const STATUS_PROBABILITY: Record<QuoteStatus, number> = {
  Draft: 0.25,
  Sent: 0.6,
  Approved: 1,
  Revision: 0,
  Closed: 0,
  Expired: 0,
  Converted: 1,
};

export function weightedPipelineValue(quotes: Quote[]): number {
  return quotes.reduce((sum, q) => sum + q.total * STATUS_PROBABILITY[q.status], 0);
}

export function totalValue(quotes: Quote[]): number {
  return quotes.reduce((sum, q) => sum + q.total, 0);
}

// ----------------------------------------------------------------------------
// Last-used theme persistence (Chunk F)
//
// Quotes carry their own themeSlug, but new quotes initialize from the last
// theme the operator picked across any quote. Stored under a single
// localStorage key; per-browser only (no DB persistence yet).
// ----------------------------------------------------------------------------

export const LAST_USED_THEME_KEY = "nexvelon:last-used-theme";

export function readLastUsedThemeSlug(): QuoteThemeSlug | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LAST_USED_THEME_KEY);
    if (stored && isValidQuoteThemeSlug(stored)) return stored;
    return null;
  } catch {
    return null;
  }
}

export function writeLastUsedThemeSlug(slug: QuoteThemeSlug): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_USED_THEME_KEY, slug);
  } catch {
    // swallow — localStorage may be unavailable in private mode
  }
}

// ----------------------------------------------------------------------------
// Take-off aggregation (QD-2 Phase 5a)
//
// The Drawings & Take-off schedule page renders a summary chip per line-item
// classification. takeoffGroups() flattens every section's items and groups
// them by classification, summing quantities. Pure / SSR-safe.
// ----------------------------------------------------------------------------

export interface TakeoffGroup {
  classification: string;
  totalQty: number;
  lineCount: number;
  items: BuilderLineItem[];
}

/**
 * Aggregate all line items across all sections, grouped by classification.
 * Used by the Drawings & Take-off page to render summary chips.
 * Pure / SSR-safe. Returns groups sorted by classification name (alphabetical).
 */
export function takeoffGroups(sections: QuoteSection[]): TakeoffGroup[] {
  const map = new Map<string, TakeoffGroup>();
  for (const section of sections) {
    for (const item of section.items) {
      const key = item.classification ?? "Unclassified";
      const existing = map.get(key);
      if (existing) {
        existing.totalQty += item.qty;
        existing.lineCount += 1;
        existing.items.push(item);
      } else {
        map.set(key, {
          classification: key,
          totalQty: item.qty,
          lineCount: 1,
          items: [item],
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.classification.localeCompare(b.classification)
  );
}
