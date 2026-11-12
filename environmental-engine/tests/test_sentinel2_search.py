from datetime import datetime, timezone

import pytest

from ba_environmental_engine.sources.sentinel2_search import Sentinel2SearchCriteria, search_sentinel2_scenes


def _item(scene_id='scene-1', timestamp='2026-06-01T10:00:00Z', cloud=12):
    return {'type':'Feature','collection':'sentinel-2-l2a','id':scene_id,'properties':{'datetime':timestamp,'eo:cloud_cover':cloud,'proj:epsg':32631},'assets':{'red':{'href':'https://example.s3.amazonaws.com/B04.tif'},'nir':{'href':'https://example.s3.amazonaws.com/B08.tif'},'scl':{'href':'https://example.s3.amazonaws.com/SCL.tif'}},'links':[{'rel':'self','href':f'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/{scene_id}'}]}


def _criteria(**kwargs):
    values = dict(aoi_geojson={'type':'Polygon','coordinates':[[[2,36],[3,36],[3,37],[2,36]]]},start=datetime(2026,5,1,tzinfo=timezone.utc),end=datetime(2026,7,1,tzinfo=timezone.utc),max_cloud_cover_pct=20,max_items=10,page_size=2)
    values.update(kwargs)
    return Sentinel2SearchCriteria(**values)


class Response:
    def __init__(self, payload): self.payload = payload
    def raise_for_status(self): pass
    def json(self): return self.payload


def test_search_follows_pages_deduplicates_and_sorts_scenes():
    calls = []
    def request(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            return Response({'features':[_item('later','2026-06-20T10:00:00Z'),_item('earlier','2026-06-02T10:00:00Z')],'links':[{'rel':'next','href':'https://earth-search.aws.element84.com/v1/search?token=2'}]})
        return Response({'features':[_item('earlier','2026-06-02T10:00:00Z'),_item('cloudy',cloud=90)],'links':[]})
    result = search_sentinel2_scenes(_criteria(), request=request)
    assert [scene.scene_id for scene in result.scenes] == ['earlier','later']
    assert [item['id'] for item in result.items] == ['earlier','later']
    assert result.items[0]['assets']['red']['href'].endswith('B04.tif')
    assert result.pages_read == 2
    assert result.items_seen == 4
    assert result.rejected_items == 1
    assert calls[0]['method'] == 'POST'
    assert calls[1]['method'] == 'GET'


def test_search_rejects_untrusted_pagination_url():
    def request(**kwargs):
        return Response({'features':[],'links':[{'rel':'next','href':'https://attacker.example/steal'}]})
    with pytest.raises(ValueError, match='Earth Search'):
        search_sentinel2_scenes(_criteria(), request=request)


def test_search_rejects_invalid_date_window():
    with pytest.raises(ValueError, match='earlier'):
        search_sentinel2_scenes(_criteria(start=datetime(2026,7,1,tzinfo=timezone.utc)),request=lambda **kwargs: Response({'features':[]}))
