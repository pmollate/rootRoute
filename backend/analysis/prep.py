import pandas as pd
def load(p):
    d=pd.read_csv(p+'/deliveries.csv')
    for c in ['order_received_ts','shipped_ts','promised_date','pick_list_date','delivered_date']: d[c]=pd.to_datetime(d[c])
    d['late']=d.on_time=='N'; d['after8']=d.order_received_ts.dt.hour>=8
    d['recv_d']=d.order_received_ts.dt.normalize()
    d['wrong_wh']=d.fulfilment_warehouse_id!=d.nearest_warehouse_id
    d['route_dev']=d.actual_route_km/d.planned_route_km
    d['f_addr']=d.address_status=='incomplete'; d['f_stock']=d.wrong_wh
    d['f_cutoff']=(d.commitment_type=='same_day')&d.after8
    d['f_carrier']=d.carrier_id=='D'; d['f_carEF']=d.carrier_id.isin(['E','F'])
    d['f_route']=d.route_dev>1.122
    c=pd.read_csv(p+'/clients.csv'); return d.merge(c,on='client_id',how='left'),c
F=['f_addr','f_stock','f_cutoff','f_carrier','f_carEF','f_route']
