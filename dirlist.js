var 
substitute = function(str, data){
	return str.replace(/\{(\w+)\}/g, function(r, m){
		return data[m] !== undefined ? data[m] : '{' + m + '}';
	});
},
template = 		'<!DOCTYPE html>'+
						'<html>'+
						'<head>'+
							'<meta charset="utf-8"/>'+
							'<title>{title}</title>'+
							'<style>a:link,a:hover,a:visited{color:#00E;}</style>'+
						'</head>'+
						'<body>'+
							'{body}'+
						'</body>'+
					'</html>';
					

//返回文件列表html
exports.list = function(obj,files){
	var
	html,
	href = '',
	arr = [];
	
	for(var i =0;i<files.length;i++){
		href = obj.pathname+'/'+files[i];
		arr.push('<li><a href="'+href.replace('//','/')+'">'+files[i]+'</a></li>');
	}
	
	html = substitute(template,{title:'List',body:'<ul>'+arr.join('')+'</ul>'})
	return html;
};